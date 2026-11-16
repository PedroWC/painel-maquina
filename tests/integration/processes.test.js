'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakePs } = require('../helpers/fake-ps');
const { createProcessRoutes } = require('../../src/routes/processes');
const { PROCESS_LIST, PROCESS_KILL } = require('../../src/ps-scripts');
const { HttpError } = require('../../src/validate');

const OWN_PID = 4242;
const TERMINAL_PID = 5151;
const DATA = {
  procs: [
    { pid: 900, name: 'chrome', mem: 812.4, cpu: 301 },
    { pid: OWN_PID, name: 'node', mem: 96, cpu: 12 },
    { pid: TERMINAL_PID, name: 'powershell', mem: 40, cpu: 1 },
    { pid: 4, name: 'System', mem: 0.1, cpu: 0 },
  ],
  ports: [
    { port: 8080, addr: '0.0.0.0', pid: 900, name: 'chrome' },
    { port: 8780, addr: '127.0.0.1', pid: OWN_PID, name: 'node' },
  ],
};

async function setup(psOptions = { listResult: DATA }) {
  const ps = createFakePs(psOptions);
  const { routes } = createProcessRoutes({ ps, protectedPids: () => new Set([OWN_PID, TERMINAL_PID]) });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  const kill = (body) =>
    request({
      port: srv.port,
      method: 'POST',
      path: '/api/processes/kill',
      body,
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' },
    });
  return { srv, ps, auth, kill };
}

test('RF-17: lista processos e portas e marca o que é do painel ou do sistema', async () => {
  const { srv, ps, auth } = await setup();
  try {
    const res = await request({ port: srv.port, path: '/api/processes', headers: auth });
    assert.equal(res.status, 200);
    assert.equal(ps.calls[0].script, PROCESS_LIST);
    const byPid = Object.fromEntries(res.json.procs.map((p) => [p.pid, p.protected]));
    assert.deepEqual(byPid, { 900: false, [OWN_PID]: true, [TERMINAL_PID]: true, 4: true });
    assert.deepEqual(res.json.ports.map((p) => [p.port, p.protected]), [[8080, false], [8780, true]]);
  } finally {
    await srv.close();
  }
});

test('RF-17: resposta vazia vira listas vazias', async () => {
  const { srv, auth } = await setup({ listResult: null });
  try {
    const res = await request({ port: srv.port, path: '/api/processes', headers: auth });
    assert.deepEqual(res.json, { procs: [], ports: [] });
  } finally {
    await srv.close();
  }
});

test('RF-17: encerra um processo comum enviando só o PID inteiro ao sistema', async () => {
  const { srv, ps, kill } = await setup();
  try {
    const res = await kill({ pid: 900 });
    assert.equal(res.status, 200);
    assert.equal(ps.calls[0].script, PROCESS_KILL);
    assert.deepEqual(ps.calls[0].params, { pid: 900 });
  } finally {
    await srv.close();
  }
});

test('RN-04: o processo do painel e os dos terminais não podem ser encerrados', async () => {
  const { srv, ps, kill } = await setup();
  try {
    for (const pid of [OWN_PID, TERMINAL_PID]) {
      const res = await kill({ pid });
      assert.equal(res.status, 409, String(pid));
      assert.match(res.json.error, /protegido/);
    }
    assert.equal(ps.calls.length, 0);
    assert.equal(srv.readAudit().split(/\r?\n/).filter((l) => l.includes('"recusado"')).length, 2);
  } finally {
    await srv.close();
  }
});

test('RN-04: processos do sistema (PID 0 a 4) nunca podem ser encerrados', async () => {
  const { srv, ps, kill } = await setup();
  try {
    for (const pid of [0, 1, 4]) assert.equal((await kill({ pid })).status, 409, String(pid));
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RN-17: PID inválido responde 400 sem tocar o sistema', async () => {
  const { srv, ps, kill } = await setup();
  try {
    for (const pid of ['900', 9.5, -1, 99999999, null, undefined, '900; calc', [900], {}]) {
      assert.equal((await kill({ pid })).status, 400, JSON.stringify(pid));
    }
    assert.equal((await kill({})).status, 400);
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RF-17: processo que já não existe responde 404', async () => {
  const { srv, kill } = await setup({ failWith: () => new HttpError(500, 'PROCESSO_NAO_EXISTE') });
  try {
    assert.equal((await kill({ pid: 900 })).status, 404);
  } finally {
    await srv.close();
  }
});

test('RN-06: encerrar processo é auditado com o nome, inclusive falhas', async () => {
  const ok = await setup();
  try {
    ok.ps.run = async (script, params) => {
      ok.ps.calls.push({ script, params });
      return 'chrome\r\n';
    };
    await ok.kill({ pid: 900 });
    const [event] = ok.srv.readAudit().trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.action === 'processo.encerrar');
    assert.deepEqual([event.target, event.result, event.detail], ['900', 'ok', { name: 'chrome' }]);
  } finally {
    await ok.srv.close();
  }
  const failing = await setup({ failWith: () => new HttpError(500, 'Acesso negado.') });
  try {
    assert.equal((await failing.kill({ pid: 900 })).status, 500);
    assert.match(failing.srv.readAudit(), /"processo\.encerrar".*"falha"/);
  } finally {
    await failing.srv.close();
  }
});

test('RNF-01: as rotas de processos exigem sessão e X-Requested-With', async () => {
  const { srv, auth } = await setup();
  try {
    const anonList = await request({ port: srv.port, path: '/api/processes' });
    assert.equal(anonList.status, 401);
    const base = { port: srv.port, method: 'POST', path: '/api/processes/kill', body: { pid: 900 } };
    const anon = await request({ ...base, headers: { 'X-Requested-With': 'painel', 'Content-Type': 'application/json' } });
    assert.equal(anon.status, 401);
    const noHeader = await request({ ...base, headers: { ...auth, 'Content-Type': 'application/json' } });
    assert.equal(noHeader.status, 403);
  } finally {
    await srv.close();
  }
});
