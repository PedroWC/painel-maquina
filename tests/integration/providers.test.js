'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakeCli } = require('../helpers/fake-cli');
const { createRegistry } = require('../../src/providers/registry');
const { defineProvider } = require('../../src/providers/base');
const { createProviderRoutes } = require('../../src/routes/providers');
const { createDockerProvider } = require('../../src/providers/docker');
const { HttpError } = require('../../src/validate');

function exemplo(overrides = {}) {
  const calls = [];
  const provider = defineProvider({
    id: 'exemplo',
    nome: 'Exemplo',
    detect: async () => ({ disponivel: true, versao: '1.0' }),
    list: async () => ({ sections: [{ id: 's', title: 'Itens', columns: [{ key: 'nome', title: 'Nome' }], rows: [{ id: 'item-1', cells: { nome: 'um' }, actions: ['restart', 'delete'] }] }] }),
    logs: async (id) => `logs de ${id}`,
    actions: {
      restart: { rotulo: 'Reiniciar', destrutiva: false, run: async (id) => calls.push(['restart', id]) },
      delete: { rotulo: 'Excluir', destrutiva: true, run: async (id) => calls.push(['delete', id]) },
      scale: {
        rotulo: 'Escalar',
        destrutiva: true,
        confirmarNome: true,
        validar: (params) => {
          if (!params || !Number.isInteger(params.replicas)) throw new HttpError(400, 'replicas inválido.');
          return { replicas: params.replicas };
        },
        run: async (id, params) => calls.push(['scale', id, params.replicas]),
      },
    },
    ...overrides,
  });
  return { provider, calls };
}

async function setup(providers) {
  const registry = createRegistry({ providers });
  await registry.refresh();
  const { routes } = createProviderRoutes({ registry, timeoutMs: 300 });
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
  return { srv, registry, auth, send, get: (path) => request({ port: srv.port, path, headers: auth }) };
}

test('RF-23: /api/providers mostra o status de cada tecnologia', async () => {
  const absent = defineProvider({ ...exemplo().provider, id: 'ausente', nome: 'Ausente', detect: async () => ({ disponivel: false }) });
  const { srv, get } = await setup([exemplo().provider, absent]);
  try {
    const res = await get('/api/providers');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.providers.map((p) => [p.id, p.disponivel, p.versao]), [['exemplo', true, '1.0'], ['ausente', false, '']]);
  } finally {
    await srv.close();
  }
});

test('RF-23: forçar nova detecção encontra a ferramenta instalada depois, sem reiniciar', async () => {
  const state = { installed: false };
  const late = exemplo({ id: 'tardio', nome: 'Tardio', detect: async () => ({ disponivel: state.installed }) }).provider;
  const { srv, get, send } = await setup([late]);
  try {
    assert.equal((await get('/api/p/tardio/items')).status, 404);
    state.installed = true;
    assert.equal((await get('/api/p/tardio/items')).status, 404, 'ainda não detectado');
    const refreshed = await send('POST', '/api/providers/refresh', {});
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.json.providers[0].disponivel, true);
    assert.equal((await get('/api/p/tardio/items')).status, 200);
    assert.match(srv.readAudit(), /"provedores\.detectar"/);
  } finally {
    await srv.close();
  }
});

test('RN-11: provedor ausente ou desconhecido responde 404 em todas as rotas', async () => {
  const absent = exemplo({ id: 'ausente', nome: 'Ausente', detect: async () => ({ disponivel: false }) }).provider;
  const { srv, get, send } = await setup([absent]);
  try {
    for (const pid of ['ausente', 'inexistente']) {
      assert.equal((await get(`/api/p/${pid}/items`)).status, 404, pid);
      assert.equal((await get(`/api/p/${pid}/logs?id=x`)).status, 404, pid);
      assert.equal((await send('POST', `/api/p/${pid}/action`, { op: 'restart', id: 'x' })).status, 404, pid);
    }
  } finally {
    await srv.close();
  }
});

test('RF-23: a listagem traz seções, ações com rótulos e destrutividade, e se há logs', async () => {
  const { srv, get } = await setup([exemplo().provider]);
  try {
    const res = await get('/api/p/exemplo/items');
    assert.equal(res.status, 200);
    assert.equal(res.json.nome, 'Exemplo');
    assert.equal(res.json.temLogs, true);
    assert.deepEqual(res.json.acoes.restart, { rotulo: 'Reiniciar', destrutiva: false, confirmarNome: false });
    assert.deepEqual(res.json.acoes.delete, { rotulo: 'Excluir', destrutiva: true, confirmarNome: false });
    assert.equal(res.json.acoes.scale.confirmarNome, true);
    assert.equal(res.json.sections[0].rows[0].id, 'item-1');
    assert.equal('run' in res.json.acoes.restart, false, 'a função run nunca é exposta');
  } finally {
    await srv.close();
  }
});

test('RN-12: só operações da allowlist e identificadores seguros chegam ao provedor', async () => {
  const { provider, calls } = exemplo();
  const { srv, send } = await setup([provider]);
  try {
    assert.equal((await send('POST', '/api/p/exemplo/action', { op: 'restart', id: 'item-1' })).status, 200);
    assert.deepEqual(calls, [['restart', 'item-1']]);
    const bad = [
      { op: 'format', id: 'item-1' },
      { op: 'toString', id: 'item-1' },
      { op: '__proto__', id: 'item-1' },
      { op: 'constructor', id: 'item-1' },
      { id: 'item-1' },
      { op: 'restart' },
      { op: 'restart', id: '--all' },
      { op: 'restart', id: '-f' },
      { op: 'restart', id: 'a; calc' },
      { op: 'restart', id: 'a b' },
      { op: 'restart', id: '' },
      { op: 5, id: 'item-1' },
    ];
    for (const body of bad) assert.equal((await send('POST', '/api/p/exemplo/action', body)).status, 400, JSON.stringify(body));
    assert.equal(calls.length, 1, 'nada indevido chegou ao provedor');
  } finally {
    await srv.close();
  }
});

test('RN-12: o id dos logs também é validado', async () => {
  const { srv, get } = await setup([exemplo().provider]);
  try {
    assert.equal((await get('/api/p/exemplo/logs?id=item-1')).json.text, 'logs de item-1');
    assert.equal((await get('/api/p/exemplo/logs?id=--follow')).status, 400);
    assert.equal((await get('/api/p/exemplo/logs')).status, 400);
    const noLogs = exemplo({ id: 'semlogs', logs: undefined }).provider;
    const other = await setup([noLogs]);
    try {
      assert.equal((await other.get('/api/p/semlogs/logs?id=x')).status, 404);
      assert.equal((await other.get('/api/p/semlogs/items')).json.temLogs, false);
    } finally {
      await other.srv.close();
    }
  } finally {
    await srv.close();
  }
});

test('RN-13: ações marcadas confirmarNome exigem digitar o nome do recurso, no servidor', async () => {
  const { provider, calls } = exemplo();
  const { srv, send } = await setup([provider]);
  try {
    const body = { op: 'scale', id: 'item-1', params: { replicas: 0 } };
    assert.equal((await send('POST', '/api/p/exemplo/action', body)).status, 400);
    assert.equal((await send('POST', '/api/p/exemplo/action', { ...body, confirm: 'outro' })).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await send('POST', '/api/p/exemplo/action', { ...body, confirm: 'item-1' })).status, 200);
    assert.deepEqual(calls, [['scale', 'item-1', 0]]);
  } finally {
    await srv.close();
  }
});

test('RN-13: provedores com confirmaPorNome exigem o nome em toda ação destrutiva', async () => {
  const { provider, calls } = exemplo({ confirmaPorNome: true });
  const { srv, send } = await setup([provider]);
  try {
    assert.equal((await send('POST', '/api/p/exemplo/action', { op: 'delete', id: 'item-1' })).status, 400);
    assert.equal((await send('POST', '/api/p/exemplo/action', { op: 'delete', id: 'item-1', confirm: 'item-1' })).status, 200);
    assert.equal((await send('POST', '/api/p/exemplo/action', { op: 'restart', id: 'item-1' })).status, 200);
    assert.deepEqual(calls, [['delete', 'item-1'], ['restart', 'item-1']]);
  } finally {
    await srv.close();
  }
});

test('RN-17: parâmetros da ação passam pela validação do provedor', async () => {
  const { provider, calls } = exemplo();
  const { srv, send } = await setup([provider]);
  try {
    const base = { op: 'scale', id: 'item-1', confirm: 'item-1' };
    assert.equal((await send('POST', '/api/p/exemplo/action', { ...base, params: { replicas: 'muitas' } })).status, 400);
    assert.equal((await send('POST', '/api/p/exemplo/action', base)).status, 400);
    assert.equal(calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RN-14: erro inesperado de um provedor vira 502 genérico e os demais seguem funcionando', async () => {
  const broken = exemplo({
    id: 'quebrado',
    nome: 'Quebrado',
    list: async () => {
      throw new Error('detalhe-interno-secreto');
    },
  }).provider;
  const { srv, get } = await setup([broken, exemplo().provider]);
  const original = console.error;
  console.error = () => {};
  try {
    const res = await get('/api/p/quebrado/items');
    assert.equal(res.status, 502);
    assert.match(res.json.error, /Falha no provedor Quebrado/);
    assert.equal(res.text.includes('detalhe-interno-secreto'), false);
    assert.equal((await get('/api/p/exemplo/items')).status, 200);
  } finally {
    console.error = original;
    await srv.close();
  }
});

test('RN-14: chamada que demora além do limite responde 502 sem travar o painel', async () => {
  const slow = exemplo({ id: 'lento', nome: 'Lento', list: () => new Promise(() => {}) }).provider;
  const { srv, get } = await setup([slow, exemplo().provider]);
  const original = console.error;
  console.error = () => {};
  try {
    const res = await get('/api/p/lento/items');
    assert.equal(res.status, 502);
    assert.equal((await get('/api/p/exemplo/items')).status, 200);
  } finally {
    console.error = original;
    await srv.close();
  }
});

test('RN-14: erros HTTP do provedor são repassados como são', async () => {
  const failing = exemplo({
    id: 'docker',
    nome: 'Docker',
    list: async () => {
      throw new HttpError(503, 'O motor não está respondendo.');
    },
  }).provider;
  const { srv, get } = await setup([failing]);
  try {
    const res = await get('/api/p/docker/items');
    assert.equal(res.status, 503);
    assert.equal(res.json.error, 'O motor não está respondendo.');
  } finally {
    await srv.close();
  }
});

test('RN-06: ações de provedores são auditadas, inclusive falhas', async () => {
  const { provider } = exemplo({
    actions: {
      ...exemplo().provider.actions,
      boom: {
        rotulo: 'Falhar',
        destrutiva: false,
        run: async () => {
          throw new HttpError(502, 'falhou');
        },
      },
    },
  });
  const { srv, send } = await setup([provider]);
  try {
    await send('POST', '/api/p/exemplo/action', { op: 'restart', id: 'item-1' });
    await send('POST', '/api/p/exemplo/action', { op: 'boom', id: 'item-1' });
    const events = srv.readAudit().trim().split(/\r?\n/).map((l) => JSON.parse(l)).filter((e) => e.action.startsWith('exemplo.'));
    assert.deepEqual(events.map((e) => [e.action, e.target, e.result]), [
      ['exemplo.restart', 'item-1', 'ok'],
      ['exemplo.boom', 'item-1', 'falha'],
    ]);
  } finally {
    await srv.close();
  }
});

test('RNF-01: todas as rotas de provedores exigem sessão e X-Requested-With', async () => {
  const { srv, auth } = await setup([exemplo().provider]);
  try {
    const calls = [
      { method: 'GET', path: '/api/providers' },
      { method: 'POST', path: '/api/providers/refresh', body: {} },
      { method: 'GET', path: '/api/p/exemplo/items' },
      { method: 'GET', path: '/api/p/exemplo/logs?id=x' },
      { method: 'POST', path: '/api/p/exemplo/action', body: { op: 'restart', id: 'x' } },
    ];
    for (const call of calls) {
      const anon = await request({ port: srv.port, ...call, headers: { 'X-Requested-With': 'painel', 'Content-Type': 'application/json' } });
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

test('RF-15: o provedor Docker funciona de ponta a ponta pelas rotas, com a CLI simulada', async () => {
  const cli = createFakeCli((exe, args) => {
    if (args[0] === '--version') return { stdout: 'Docker version 29.9.3, build 1\n' };
    if (args[0] === 'info') return { stdout: '29.9.3\n' };
    if (args[0] === 'ps') return { stdout: JSON.stringify({ ID: 'aaa111aaa111', Names: 'web', Image: 'nginx', State: 'running', Status: 'Up', Ports: '' }) };
    if (args[0] === 'images') return { stdout: '' };
    if (args[0] === 'logs') return { stdout: 'linha de log\n' };
    return { stdout: '' };
  });
  const { srv, get, send } = await setup([createDockerProvider({ cli })]);
  try {
    const providers = (await get('/api/providers')).json.providers;
    assert.deepEqual([providers[0].disponivel, providers[0].versao, providers[0].info], [true, '29.9.3', { motor: true }]);
    const items = (await get('/api/p/docker/items')).json;
    assert.equal(items.sections[0].rows[0].cells.nome, 'web');
    assert.equal(items.temLogs, true);
    assert.equal((await send('POST', '/api/p/docker/action', { op: 'stop', id: 'aaa111aaa111' })).status, 200);
    assert.deepEqual(cli.calls.at(-1).args, ['stop', 'aaa111aaa111']);
    assert.equal((await get('/api/p/docker/logs?id=aaa111aaa111')).json.text, 'linha de log\n');
    assert.equal((await send('POST', '/api/p/docker/action', { op: 'stop', id: '--all' })).status, 400);
    assert.equal((await send('POST', '/api/p/docker/action', { op: 'prune', id: 'aaa111aaa111' })).status, 400);
  } finally {
    await srv.close();
  }
});

test('UC-10: com o motor parado a API devolve 503 amigável e a aba continua utilizável', async () => {
  const { HttpError: Err } = require('../../src/validate');
  const cli = createFakeCli((exe, args) => {
    if (args[0] === '--version') return { stdout: 'Docker version 29.9.3, build 1\n' };
    throw new Err(502, 'failed to connect to the docker API at npipe:////./pipe/docker_engine');
  });
  const { srv, get } = await setup([createDockerProvider({ cli })]);
  try {
    const providers = (await get('/api/providers')).json.providers;
    assert.equal(providers[0].disponivel, true);
    assert.deepEqual(providers[0].info, { motor: false });
    const res = await get('/api/p/docker/items');
    assert.equal(res.status, 503);
    assert.match(res.json.error, /Inicie o Docker Desktop/);
    assert.equal(res.text.includes('npipe'), false);
  } finally {
    await srv.close();
  }
});
