'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakePs } = require('../helpers/fake-ps');
const { createMonitorRoutes } = require('../../src/routes/monitor');
const { createProcessRoutes } = require('../../src/routes/processes');
const { PROCESS_KILL } = require('../../src/ps-scripts');
const { CRITICAL_PROCESSES } = require('../../src/protections');
const { HttpError } = require('../../src/validate');

function row(pid, name, category, cpu, ramMb, gpu = 0) {
  return { pid, name, category, cpu, ramMb, gpu, gpuMemMb: 0, protected: pid <= 4 };
}

const DATA = {
  t: 1700000000000,
  cpu: { percent: 12.5, cores: 6 },
  ram: { totalMb: 16384, usedMb: 8192, percent: 50 },
  gpu: { percent: 3, memUsedMb: 1000, memTotalMb: 8192, temperatureC: 40, names: ['GPU Teste'], perProcess: true },
  groups: { windows: { count: 3, cpu: 2, ramMb: 300, gpu: 0 }, programas: { count: 11, cpu: 9, ramMb: 3000, gpu: 3 } },
  procs: [
    row(4, 'System', 'windows', 1, 1),
    row(10, 'svchost', 'windows', 0.5, 80),
    row(11, 'explorer', 'windows', 0.2, 250),
    ...Array.from({ length: 11 }, (_, i) => row(100 + i, `app${i}`, 'programa', i, 100 + i * 10, i === 10 ? 3 : 0)),
  ],
};

async function setup({ snapshot = async () => DATA } = {}) {
  const calls = [];
  const monitor = {
    snapshot: async () => {
      calls.push(1);
      return snapshot();
    },
  };
  const { routes } = createMonitorRoutes({ monitor });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const get = (query = '', headers = {}) => request({ port: srv.port, path: `/api/monitor${query}`, headers: { Cookie: cookie, ...headers } });
  return { srv, get, calls };
}

test('RF-28: o resumo traz os totais, os grupos e os maiores consumidores por tipo, sem a lista toda', async () => {
  const { srv, get } = await setup();
  try {
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.json.mode, 'resumo');
    assert.equal(res.json.sort, 'cpu');
    assert.deepEqual(res.json.cpu, DATA.cpu);
    assert.deepEqual(res.json.ram, DATA.ram);
    assert.equal(res.json.gpu.names[0], 'GPU Teste');
    assert.deepEqual(res.json.groups, DATA.groups);
    assert.equal('procs' in res.json, false);
    assert.equal(res.json.programs.length, 8);
    assert.deepEqual(res.json.programs.slice(0, 3).map((p) => p.name), ['app10', 'app9', 'app8']);
    assert.ok(res.json.programs.every((p) => p.category === 'programa'));
    assert.equal(res.json.windows.length, 3);
    assert.ok(res.json.windows.every((p) => p.category === 'windows'));
  } finally {
    await srv.close();
  }
});

test('RF-29: o detalhado traz todos os processos e respeita a ordem pedida', async () => {
  const { srv, get } = await setup();
  try {
    const byRam = await get('?mode=detalhado&sort=ram');
    assert.equal(byRam.json.mode, 'detalhado');
    assert.equal(byRam.json.procs.length, DATA.procs.length);
    assert.equal(byRam.json.procs[0].name, 'explorer'); // 250 MB é o maior
    const byGpu = await get('?mode=detalhado&sort=gpu');
    assert.equal(byGpu.json.procs[0].name, 'app10');
    const byName = await get('?mode=detalhado&sort=nome');
    assert.deepEqual(byName.json.procs.slice(0, 3).map((p) => p.name), ['app0', 'app1', 'app10']);
    assert.equal('programs' in byRam.json, false);
  } finally {
    await srv.close();
  }
});

test('RN-17: modo e ordem fora da lista permitida respondem 400 sem consultar o sistema', async () => {
  const { srv, get, calls } = await setup();
  try {
    for (const query of ['?mode=tudo', '?sort=memoria', '?mode=resumo&sort=cpu;calc', '?sort=%00']) {
      const res = await get(query);
      assert.equal(res.status, 400, query);
    }
    assert.equal(calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RNF-01: o monitor exige sessão (401) e confere Host (403)', async () => {
  const { srv, get } = await setup();
  try {
    const semSessao = await request({ port: srv.port, path: '/api/monitor' });
    assert.equal(semSessao.status, 401);
    const hostFalso = await get('', { Host: 'evil.example.com' });
    assert.equal(hostFalso.status, 403);
  } finally {
    await srv.close();
  }
});

test('RN-17: a resposta não vaza caminhos nem outros campos internos dos processos', async () => {
  const { srv, get } = await setup();
  try {
    const res = await get('?mode=detalhado');
    const allowed = ['pid', 'name', 'category', 'cpu', 'ramMb', 'gpu', 'gpuMemMb', 'protected'].sort();
    for (const proc of res.json.procs) assert.deepEqual(Object.keys(proc).sort(), allowed);
  } finally {
    await srv.close();
  }
});

test('RF-28: falha do amostrador vira 503 com mensagem amigável, sem detalhes internos', async () => {
  const { srv, get } = await setup({
    snapshot: async () => {
      throw new Error('C:/Users/x/segredo.ps1 falhou com stack trace');
    },
  });
  try {
    const res = await get();
    assert.equal(res.status, 503);
    assert.match(res.json.error, /Não foi possível ler os recursos/);
    assert.equal(JSON.stringify(res.json).includes('segredo'), false);
  } finally {
    await srv.close();
  }
});

test('RF-28: um HttpError do monitor mantém o próprio status', async () => {
  const { srv, get } = await setup({
    snapshot: async () => {
      throw new HttpError(504, 'Tempo esgotado.');
    },
  });
  try {
    assert.equal((await get()).status, 504);
  } finally {
    await srv.close();
  }
});

// ---- Encerrar processos pelo dashboard: proteção por nome (RN-20) ----

async function setupKill(psOptions = {}) {
  const ps = createFakePs(psOptions);
  const { routes } = createProcessRoutes({ ps, protectedPids: () => new Set([4242]) });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const kill = (body) =>
    request({
      port: srv.port,
      method: 'POST',
      path: '/api/processes/kill',
      body,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' },
    });
  const list = () => request({ port: srv.port, path: '/api/processes', headers: { Cookie: cookie } });
  return { srv, ps, kill, list };
}

test('RN-20: o encerramento envia ao sistema a lista de processos críticos para conferência por nome', async () => {
  const { srv, ps, kill } = await setupKill();
  try {
    const res = await kill({ pid: 900 });
    assert.equal(res.status, 200);
    assert.equal(ps.calls[0].script, PROCESS_KILL);
    assert.deepEqual(ps.calls[0].params, { pid: 900, protectedNames: CRITICAL_PROCESSES });
    for (const name of ['csrss', 'wininit', 'winlogon', 'lsass', 'smss', 'services', 'svchost', 'system', 'memory compression']) {
      assert.ok(ps.calls[0].params.protectedNames.includes(name), name);
    }
  } finally {
    await srv.close();
  }
});

test('RN-20: processo crítico recusado pelo sistema vira 409 e a recusa é auditada uma vez', async () => {
  const { srv, kill } = await setupKill({
    failWith: () => new Error('PROCESSO_PROTEGIDO'),
  });
  try {
    const res = await kill({ pid: 900 });
    assert.equal(res.status, 409);
    assert.match(res.json.error, /crítico do Windows/);
    assert.match(res.json.error, /aba Serviços/);
    const refusals = srv.readAudit().split(/\r?\n/).filter((l) => l.includes('"recusado"'));
    assert.equal(refusals.length, 1);
  } finally {
    await srv.close();
  }
});

test('RN-20: a listagem de processos marca os críticos como protegidos pelo nome', async () => {
  const { srv, list } = await setupKill({
    listResult: {
      procs: [
        { pid: 600, name: 'csrss', mem: 5, cpu: 1 },
        { pid: 700, name: 'SVCHOST', mem: 50, cpu: 1 },
        { pid: 900, name: 'chrome', mem: 300, cpu: 10 },
      ],
      ports: [{ port: 135, addr: '0.0.0.0', pid: 700, name: 'svchost' }],
    },
  });
  try {
    const res = await list();
    assert.deepEqual(Object.fromEntries(res.json.procs.map((p) => [p.name, p.protected])), { csrss: true, SVCHOST: true, chrome: false });
    assert.equal(res.json.ports[0].protected, true);
  } finally {
    await srv.close();
  }
});
