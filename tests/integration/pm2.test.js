'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakeCli } = require('../helpers/fake-cli');
const { createRegistry } = require('../../src/providers/registry');
const { createProviderRoutes } = require('../../src/routes/providers');
const { createPm2Provider } = require('../../src/providers/pm2');

const ENTRY = 'C:\\npm\\node_modules\\pm2\\bin\\pm2';

const PROCESSES = [
  { name: 'api', pm_id: 0, pid: 5000, monit: { memory: 1048576, cpu: 0 }, pm2_env: { status: 'online', exec_mode: 'fork_mode', restart_time: 0, pm_uptime: Date.now() - 5000 } },
  { name: 'painel', pm_id: 1, pid: 4242, monit: { memory: 1048576, cpu: 0 }, pm2_env: { status: 'online', exec_mode: 'fork_mode', restart_time: 0, pm_uptime: Date.now() - 5000 } },
];

async function setup({ located = true } = {}) {
  const cli = createFakeCli((exe, args) => {
    if (args[1] === '--version') return { stdout: '5.4.2\n' };
    if (args[1] === 'jlist') return { stdout: JSON.stringify(PROCESSES) };
    if (args[1] === 'logs') return { stdout: 'linha de log\n' };
    return { stdout: '' };
  });
  const provider = createPm2Provider({
    cli,
    locate: async () => (located ? ENTRY : null),
    daemonRunning: () => true,
    isProtectedPid: (pid) => pid === 4242,
    nodeExecutable: 'node',
  });
  const registry = createRegistry({ providers: [provider] });
  await registry.refresh();
  const { routes } = createProviderRoutes({ registry });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  const send = (method, path, body) =>
    request({ port: srv.port, method, path, body, headers: { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' } });
  return { srv, cli, send, get: (path) => request({ port: srv.port, path, headers: auth }) };
}

test('RF-19: o pm2 aparece em /api/providers com versão e daemon', async () => {
  const { srv, get } = await setup();
  try {
    const [p] = (await get('/api/providers')).json.providers;
    assert.deepEqual([p.id, p.disponivel, p.versao, p.info], ['pm2', true, '5.4.2', { daemon: true }]);
  } finally {
    await srv.close();
  }
});

test('RN-11: sem pm2 instalado a aba não existe e as rotas respondem 404', async () => {
  const { srv, get, send } = await setup({ located: false });
  try {
    assert.equal((await get('/api/providers')).json.providers[0].disponivel, false);
    assert.equal((await get('/api/p/pm2/items')).status, 404);
    assert.equal((await send('POST', '/api/p/pm2/action', { op: 'stop', id: '0' })).status, 404);
  } finally {
    await srv.close();
  }
});

test('RF-19: lista pelas rotas, com rótulos das ações e destrutividade', async () => {
  const { srv, get } = await setup();
  try {
    const res = (await get('/api/p/pm2/items')).json;
    assert.equal(res.temLogs, true);
    assert.deepEqual(res.acoes.stop, { rotulo: 'Parar', destrutiva: true, confirmarNome: false, campos: [] });
    assert.deepEqual(res.acoes.restart, { rotulo: 'Reiniciar', destrutiva: false, confirmarNome: false, campos: [] });
    assert.deepEqual(res.sections[0].rows.map((r) => [r.id, r.actions.length]), [['0', 3], ['1', 0]]);
  } finally {
    await srv.close();
  }
});

test('RN-12: só ids numéricos e operações da allowlist chegam ao pm2', async () => {
  const { srv, cli, send } = await setup();
  try {
    assert.equal((await send('POST', '/api/p/pm2/action', { op: 'restart', id: '0' })).status, 200);
    assert.deepEqual(cli.calls.at(-1).args, [ENTRY, 'restart', '0']);
    const bad = [
      { op: 'restart', id: 'api' },
      { op: 'restart', id: '--all' },
      { op: 'restart', id: '0; calc' },
      { op: 'kill', id: '0' },
      { op: 'resurrect', id: '0' },
      { op: 'restart', id: '' },
    ];
    for (const body of bad) assert.equal((await send('POST', '/api/p/pm2/action', body)).status, 400, JSON.stringify(body));
  } finally {
    await srv.close();
  }
});

test('RN-04: o painel gerenciado pelo pm2 não pode ser parado, reiniciado nem excluído pela API', async () => {
  const { srv, cli, send } = await setup();
  try {
    for (const op of ['stop', 'restart', 'delete']) {
      const res = await send('POST', '/api/p/pm2/action', { op, id: '1' });
      assert.equal(res.status, 409, op);
      assert.match(res.json.error, /protegido/);
    }
    assert.equal(cli.calls.some((c) => ['stop', 'restart', 'delete'].includes(c.args[1])), false);
    const audit = srv.readAudit();
    assert.equal(audit.split(/\r?\n/).filter((l) => l.includes('"recusado"')).length, 3, 'cada recusa fica registrada');
    assert.match(audit, /"pm2\.stop".*"falha"/);
    assert.match(audit, /"detail":\{"motivo":"Processo protegido[^}]*"op":"stop"/);
  } finally {
    await srv.close();
  }
});

test('RN-05 e RF-19: logs pelas rotas e auditoria das ações', async () => {
  const { srv, get, send } = await setup();
  try {
    assert.equal((await get('/api/p/pm2/logs?id=0')).json.text, 'linha de log\n');
    assert.equal((await get('/api/p/pm2/logs?id=--follow')).status, 400);
    await send('POST', '/api/p/pm2/action', { op: 'stop', id: '0' });
    const events = srv.readAudit().trim().split(/\r?\n/).map((l) => JSON.parse(l)).filter((e) => e.action.startsWith('pm2.'));
    assert.deepEqual(events.map((e) => [e.action, e.target, e.result]), [['pm2.stop', '0', 'ok']]);
  } finally {
    await srv.close();
  }
});
