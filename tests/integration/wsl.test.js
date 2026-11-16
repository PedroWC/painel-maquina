'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakeCli } = require('../helpers/fake-cli');
const { createRegistry } = require('../../src/providers/registry');
const { createProviderRoutes } = require('../../src/routes/providers');
const { createWslProvider } = require('../../src/providers/wsl');

const VERBOSE = ['  NAME      STATE      VERSION', '* Ubuntu    Running    2', '  Debian    Stopped    2', ''].join('\r\n');

async function setup() {
  const cli = createFakeCli((exe, args) => {
    if (args[0] === '--version') return { stdout: 'WSL version: 2.4.0.0\r\n' };
    if (args.includes('--verbose')) return { stdout: VERBOSE };
    if (args.includes('--running')) return { stdout: 'Ubuntu\r\n' };
    return { stdout: '' };
  });
  const registry = createRegistry({ providers: [createWslProvider({ cli })] });
  await registry.refresh();
  const { routes } = createProviderRoutes({ registry });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  const send = (method, path, body) =>
    request({ port: srv.port, method, path, body, headers: { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' } });
  return { srv, cli, send, get: (path) => request({ port: srv.port, path, headers: auth }) };
}

test('RF-22: o WSL aparece em /api/providers e lista as distribuições com o terminal oferecido', async () => {
  const { srv, get } = await setup();
  try {
    const [p] = (await get('/api/providers')).json.providers;
    assert.deepEqual([p.id, p.disponivel, p.versao], ['wsl', true, '2.4.0.0']);
    const res = (await get('/api/p/wsl/items')).json;
    assert.deepEqual(res.sections[0].rows.map((r) => [r.id, r.terminal.distro]), [['Ubuntu', 'Ubuntu'], ['Debian', 'Debian']]);
    assert.equal(res.temLogs, false);
  } finally {
    await srv.close();
  }
});

test('RN-05: encerrar uma distribuição pede só confirmação simples na interface e usa o id', async () => {
  const { srv, cli, send } = await setup();
  try {
    assert.equal((await send('POST', '/api/p/wsl/action', { op: 'terminate', id: 'Ubuntu' })).status, 200);
    assert.deepEqual(cli.calls.at(-1).args, ['--terminate', 'Ubuntu']);
  } finally {
    await srv.close();
  }
});

test('RN-05: desligar o WSL exige digitar "wsl", conferido no servidor', async () => {
  const { srv, cli, send } = await setup();
  try {
    const body = { op: 'shutdown', id: '_todas' };
    assert.equal((await send('POST', '/api/p/wsl/action', body)).status, 400);
    assert.equal((await send('POST', '/api/p/wsl/action', { ...body, confirm: '_todas' })).status, 400, 'o id não vale como confirmação');
    assert.equal((await send('POST', '/api/p/wsl/action', { ...body, confirm: 'outro' })).status, 400);
    assert.equal(cli.calls.some((c) => c.args.includes('--shutdown')), false);
    assert.equal((await send('POST', '/api/p/wsl/action', { ...body, confirm: 'wsl' })).status, 200);
    assert.deepEqual(cli.calls.at(-1).args, ['--shutdown']);
  } finally {
    await srv.close();
  }
});

test('RN-12: ids e operações inválidas não chegam ao wsl.exe', async () => {
  const { srv, cli, send } = await setup();
  try {
    const before = cli.calls.length;
    const bad = [
      { op: 'terminate', id: '-d' },
      { op: 'terminate', id: '--shutdown' },
      { op: 'terminate', id: '_todas' },
      { op: 'shutdown', id: 'Ubuntu', confirm: 'Ubuntu' },
      { op: 'unregister', id: 'Ubuntu' },
      { op: 'export', id: 'Ubuntu' },
    ];
    for (const body of bad) assert.equal((await send('POST', '/api/p/wsl/action', body)).status, 400, JSON.stringify(body));
    assert.equal(cli.calls.length, before);
  } finally {
    await srv.close();
  }
});
