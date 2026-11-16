'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakePs } = require('../helpers/fake-ps');
const { createServiceRoutes } = require('../../src/routes/services');
const { SERVICE_LIST, SERVICE_ACTION, SERVICE_CREATE, SERVICE_EDIT } = require('../../src/ps-scripts');
const { HttpError } = require('../../src/validate');

async function setup(psOptions) {
  const ps = createFakePs(psOptions);
  const { routes } = createServiceRoutes({ ps });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  const send = (method, path, body) =>
    request({
      port: srv.port,
      method,
      path,
      body,
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' },
    });
  return { srv, ps, auth, send };
}

const action = (name, op, extra = {}) => ({ name, op, ...extra });

test('RF-11: lista os serviços e marca os críticos do Windows', async () => {
  const items = [
    { name: 'meu-servico', state: 'Running', start: 'Auto' },
    { name: 'EventLog', state: 'Running', start: 'Auto' },
  ];
  const { srv, ps, auth } = await setup({ listResult: items });
  try {
    const res = await request({ port: srv.port, path: '/api/services', headers: auth });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.services.map((s) => [s.name, s.critical]), [['meu-servico', false], ['EventLog', true]]);
    assert.equal(ps.calls[0].script, SERVICE_LIST);
  } finally {
    await srv.close();
  }
});

test('RF-11: resposta vazia vira lista vazia', async () => {
  const { srv, auth } = await setup({ listResult: null });
  try {
    assert.deepEqual((await request({ port: srv.port, path: '/api/services', headers: auth })).json.services, []);
  } finally {
    await srv.close();
  }
});

test('RF-12 e RF-13: iniciar, parar, reiniciar e mudar a inicialização chegam ao sistema', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const op of ['start', 'stop', 'restart', 'auto', 'manual', 'disabled']) {
      assert.equal((await send('POST', '/api/services/action', action('meu-servico', op))).status, 200, op);
    }
    assert.deepEqual(
      ps.calls.map((c) => [c.script === SERVICE_ACTION, c.params.name, c.params.op]),
      ['start', 'stop', 'restart', 'auto', 'manual', 'disabled'].map((op) => [true, 'meu-servico', op]),
    );
  } finally {
    await srv.close();
  }
});

test('RN-17: operação inválida e nomes com curingas ou separadores respondem 400', async () => {
  const { srv, ps, send } = await setup();
  try {
    const bad = [
      action('meu-servico', 'format'),
      { name: 'meu-servico' },
      action('', 'start'),
      action('*', 'stop'),
      action('?', 'stop'),
      action('a*', 'stop'),
      action('[ab]', 'stop'),
      action('a/b', 'start'),
      action('a\\b', 'start'),
      action('x'.repeat(257), 'start'),
      action('a\nb', 'start'),
      { name: 5, op: 'start' },
    ];
    for (const body of bad) {
      assert.equal((await send('POST', '/api/services/action', body)).status, 400, JSON.stringify(body));
    }
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RN-09: serviços críticos só aceitam iniciar; o resto responde 409 sem tocar o sistema', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const op of ['stop', 'restart', 'auto', 'manual', 'disabled']) {
      assert.equal((await send('POST', '/api/services/action', action('EventLog', op))).status, 409, op);
    }
    const del = await send('POST', '/api/services/action', action('eventlog', 'delete', { confirm: 'eventlog' }));
    assert.equal(del.status, 409);
    assert.equal((await send('PUT', '/api/services', { name: 'Schedule', display: 'x' })).status, 409);
    assert.equal((await send('POST', '/api/services', { name: 'RpcSs', path: 'C:\\x.exe' })).status, 409);
    assert.equal(ps.calls.length, 0);
    assert.equal((await send('POST', '/api/services/action', action('EventLog', 'start'))).status, 200);
  } finally {
    await srv.close();
  }
});

test('RN-05: excluir um serviço exige digitar o nome, também no servidor', async () => {
  const { srv, ps, send } = await setup();
  try {
    assert.equal((await send('POST', '/api/services/action', action('meu-servico', 'delete'))).status, 400);
    assert.equal(
      (await send('POST', '/api/services/action', action('meu-servico', 'delete', { confirm: 'outro' }))).status,
      400,
    );
    assert.equal(ps.calls.length, 0);
    const ok = await send('POST', '/api/services/action', action('meu-servico', 'delete', { confirm: 'meu-servico' }));
    assert.equal(ok.status, 200);
    assert.equal(ps.calls[0].params.op, 'delete');
  } finally {
    await srv.close();
  }
});

test('RN-05: parar, reiniciar ou desativar o sshd exige confirmação reforçada', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const op of ['stop', 'restart', 'disabled', 'manual']) {
      assert.equal((await send('POST', '/api/services/action', action('sshd', op))).status, 400, op);
    }
    assert.equal((await send('PUT', '/api/services', { name: 'sshd', display: 'x' })).status, 400);
    assert.equal(ps.calls.length, 0);
    assert.equal((await send('POST', '/api/services/action', action('sshd', 'restart', { confirm: 'sshd' }))).status, 200);
    assert.equal((await send('POST', '/api/services/action', action('sshd', 'start'))).status, 200);
    assert.equal((await send('POST', '/api/services/action', action('sshd', 'auto'))).status, 200);
  } finally {
    await srv.close();
  }
});

test('RF-14: cria o serviço com os parâmetros validados e valores padrão', async () => {
  const { srv, ps, send } = await setup();
  try {
    const res = await send('POST', '/api/services', {
      name: 'meu-servico',
      path: 'C:\\apps\\meu-servico.exe --porta 80',
      display: 'Meu serviço',
      desc: 'Descrição',
      start: 'manual',
    });
    assert.equal(res.status, 200);
    assert.equal(ps.calls[0].script, SERVICE_CREATE);
    assert.deepEqual(ps.calls[0].params, {
      name: 'meu-servico',
      path: 'C:\\apps\\meu-servico.exe --porta 80',
      display: 'Meu serviço',
      desc: 'Descrição',
      start: 'Manual',
    });
    await send('POST', '/api/services', { name: 'outro', path: 'C:\\x.exe' });
    assert.equal(ps.calls[1].params.start, 'Automatic');
    assert.equal(ps.calls[1].params.display, '');
  } finally {
    await srv.close();
  }
});

test('RF-14: criação com dados inválidos responde 400', async () => {
  const { srv, ps, send } = await setup();
  try {
    const bad = [
      { name: 'x' },
      { name: 'x', path: '' },
      { name: 'x', path: 'C:\\a.exe', start: 'boot' },
      { name: 'x', path: 'C:\\a.exe', display: 'd'.repeat(257) },
      { name: 'x', path: 'C:\\a.exe', desc: 'd'.repeat(1025) },
      { name: '*', path: 'C:\\a.exe' },
      { path: 'C:\\a.exe' },
    ];
    for (const body of bad) assert.equal((await send('POST', '/api/services', body)).status, 400, JSON.stringify(body));
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RF-14: editar envia só o que foi informado e mantém a descrição quando omitida', async () => {
  const { srv, ps, send } = await setup();
  try {
    assert.equal((await send('PUT', '/api/services', { name: 'meu-servico', display: 'Novo nome', start: 'disabled' })).status, 200);
    assert.equal(ps.calls[0].script, SERVICE_EDIT);
    assert.deepEqual(ps.calls[0].params, { name: 'meu-servico', path: '', display: 'Novo nome', desc: null, start: 'Disabled' });
    await send('PUT', '/api/services', { name: 'meu-servico', desc: '' });
    assert.equal(ps.calls[1].params.desc, '');
    assert.equal((await send('PUT', '/api/services', { name: 'meu-servico', start: 'boot' })).status, 400);
  } finally {
    await srv.close();
  }
});

test('RF-14: serviço inexistente responde 404 e nome repetido na criação responde 409', async () => {
  const missing = await setup({ failWith: () => new HttpError(500, 'SERVICO_NAO_EXISTE') });
  try {
    assert.equal((await missing.send('POST', '/api/services/action', action('nada', 'start'))).status, 404);
    assert.equal((await missing.send('PUT', '/api/services', { name: 'nada', display: 'x' })).status, 404);
  } finally {
    await missing.srv.close();
  }
  const exists = await setup({ failWith: () => new HttpError(500, 'SERVICO_EXISTE') });
  try {
    const res = await exists.send('POST', '/api/services', { name: 'meu-servico', path: 'C:\\a.exe' });
    assert.equal(res.status, 409);
  } finally {
    await exists.srv.close();
  }
});

test('RNF-01: todas as rotas de serviços exigem sessão e X-Requested-With', async () => {
  const { srv, auth } = await setup();
  try {
    const calls = [
      { method: 'GET', path: '/api/services' },
      { method: 'POST', path: '/api/services', body: { name: 'a', path: 'b' } },
      { method: 'PUT', path: '/api/services', body: { name: 'a' } },
      { method: 'POST', path: '/api/services/action', body: action('a', 'start') },
    ];
    for (const call of calls) {
      const anon = await request({
        port: srv.port,
        ...call,
        headers: { 'X-Requested-With': 'painel', 'Content-Type': 'application/json' },
      });
      assert.equal(anon.status, 401, `${call.method} ${call.path}`);
      if (call.method !== 'GET') {
        const noHeader = await request({ port: srv.port, ...call, headers: { ...auth, 'Content-Type': 'application/json' } });
        assert.equal(noHeader.status, 403, `${call.method} ${call.path} sem cabeçalho`);
      }
    }
  } finally {
    await srv.close();
  }
});

test('RN-06: ações sobre serviços são auditadas, inclusive falhas', async () => {
  const { srv, send } = await setup();
  try {
    await send('POST', '/api/services', { name: 'meu-servico', path: 'C:\\a.exe' });
    await send('POST', '/api/services/action', action('meu-servico', 'stop'));
    await send('POST', '/api/services/action', action('meu-servico', 'delete', { confirm: 'meu-servico' }));
    const events = srv.readAudit().trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.action.startsWith('servico.'));
    assert.deepEqual(events.map((e) => [e.action, e.result]), [
      ['servico.criar', 'ok'],
      ['servico.stop', 'ok'],
      ['servico.delete', 'ok'],
    ]);
  } finally {
    await srv.close();
  }
  const failing = await setup({ failWith: () => new HttpError(500, 'Acesso negado.') });
  try {
    const res = await failing.send('POST', '/api/services/action', action('meu-servico', 'stop'));
    assert.equal(res.status, 500);
    assert.match(failing.srv.readAudit(), /"servico\.stop".*"falha"/);
  } finally {
    await failing.srv.close();
  }
});
