'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, login } = require('../helpers/server');
const { createFakeCli } = require('../helpers/fake-cli');
const { createRegistry } = require('../../src/providers/registry');
const { createProviderRoutes } = require('../../src/routes/providers');
const { createKubernetesProvider } = require('../../src/providers/kubernetes');
const { HttpError } = require('../../src/validate');

const RESOURCES = [
  { kind: 'Deployment', metadata: { name: 'web', creationTimestamp: new Date().toISOString() }, spec: { replicas: 2 }, status: { readyReplicas: 2 } },
  { kind: 'Pod', metadata: { name: 'web-abc', creationTimestamp: new Date().toISOString() }, spec: { containers: [{}] }, status: { phase: 'Running', containerStatuses: [{ ready: true }] } },
];

function handler({ down = false } = {}) {
  return (exe, args) => {
    if (args[0] === 'version') return { stdout: JSON.stringify({ clientVersion: { gitVersion: 'v1.30.2' } }) };
    if (args[0] === 'config' && args[1] === 'get-contexts') return { stdout: 'dev\nprod\n' };
    if (args[0] === 'config' && args[1] === 'current-context') return { stdout: 'dev\n' };
    if (args[0] === 'config' && args[1] === 'view') return { stdout: 'default' };
    if (down && args.some((a) => a.startsWith('--context='))) throw new HttpError(502, 'Unable to connect to the server: connection refused');
    if (args.includes('namespaces')) return { stdout: JSON.stringify({ items: [{ metadata: { name: 'default' } }, { metadata: { name: 'prod' } }] }) };
    if (args.includes('get')) return { stdout: JSON.stringify({ items: RESOURCES }) };
    if (args.includes('logs')) return { stdout: 'log do pod\n' };
    return { stdout: '' };
  };
}

async function setup(options) {
  const cli = createFakeCli(handler(options));
  const registry = createRegistry({ providers: [createKubernetesProvider({ cli })] });
  await registry.refresh();
  const { routes } = createProviderRoutes({ registry });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  const send = (method, path, body) =>
    request({ port: srv.port, method, path, body, headers: { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' } });
  return { srv, cli, send, get: (path) => request({ port: srv.port, path, headers: auth }) };
}

const lastCluster = (cli) => cli.calls.filter((c) => c.args.some((a) => a.startsWith('--context='))).at(-1).args;

test('RF-20: o Kubernetes aparece em /api/providers com a versão do kubectl', async () => {
  const { srv, get } = await setup();
  try {
    const [p] = (await get('/api/providers')).json.providers;
    assert.deepEqual([p.id, p.disponivel, p.versao], ['kubernetes', true, '1.30.2']);
  } finally {
    await srv.close();
  }
});

test('RN-13: a listagem traz o banner de contexto e namespace, os seletores e as ações descritas', async () => {
  const { srv, get } = await setup();
  try {
    const res = (await get('/api/p/kubernetes/items')).json;
    assert.equal(res.contexto, 'Contexto: dev · Namespace: default');
    assert.deepEqual(res.controles.map((c) => c.id), ['context', 'namespace']);
    assert.equal(res.confirmaPorNome, true);
    assert.deepEqual(res.acoes.scale.campos.map((c) => c.id), ['replicas']);
    assert.deepEqual(res.acoes.delete, { rotulo: 'Excluir', destrutiva: true, confirmarNome: false, campos: [] });
    assert.equal(res.sections[0].rows[0].nomeConfirmacao, 'web');
  } finally {
    await srv.close();
  }
});

test('RF-20: os parâmetros de consulta escolhem o contexto e o namespace e chegam ao kubectl', async () => {
  const { srv, cli, get } = await setup();
  try {
    const res = (await get('/api/p/kubernetes/items?context=prod&namespace=prod')).json;
    assert.equal(res.contexto, 'Contexto: prod · Namespace: prod');
    assert.deepEqual(lastCluster(cli), ['--context=prod', '--request-timeout=10s', '--namespace=prod', 'get', 'pods,deployments,services', '-o', 'json']);
    const hostile = (await get('/api/p/kubernetes/items?context=--all-namespaces&namespace=%3Bcalc&__proto__=x&extra=1')).json;
    assert.equal(hostile.contexto, 'Contexto: dev · Namespace: default');
  } finally {
    await srv.close();
  }
});

test('RN-14: com o cluster fora do ar a rota responde 200 com aviso amigável e os seletores', async () => {
  const { srv, get } = await setup({ down: true });
  try {
    const res = await get('/api/p/kubernetes/items');
    assert.equal(res.status, 200);
    assert.match(res.json.aviso, /Não foi possível conectar ao cluster/);
    assert.equal(res.json.controles.length, 2);
    assert.deepEqual(res.json.sections, []);
    assert.equal(res.text.includes('connection refused'), false);
  } finally {
    await srv.close();
  }
});

test('RN-13: ações destrutivas exigem digitar o NOME do recurso (e não o id completo), no servidor', async () => {
  const { srv, cli, send } = await setup();
  try {
    const base = { op: 'delete', id: 'pod/prod/web-abc', params: { context: 'dev' } };
    assert.equal((await send('POST', '/api/p/kubernetes/action', base)).status, 400);
    assert.equal((await send('POST', '/api/p/kubernetes/action', { ...base, confirm: 'outro' })).status, 400);
    assert.equal((await send('POST', '/api/p/kubernetes/action', { ...base, confirm: 'pod/prod/web-abc' })).status, 400, 'o id completo não vale');
    assert.equal(cli.calls.filter((c) => c.args.includes('delete')).length, 0);
    const ok = await send('POST', '/api/p/kubernetes/action', { ...base, confirm: 'web-abc' });
    assert.equal(ok.status, 200);
    assert.deepEqual(lastCluster(cli), ['--context=dev', '--request-timeout=10s', '--namespace=prod', 'delete', 'pod/web-abc', '--wait=false']);
  } finally {
    await srv.close();
  }
});

test('RN-13: reiniciar o rollout e escalar também exigem o nome; escalar valida as réplicas', async () => {
  const { srv, cli, send } = await setup();
  try {
    const id = 'deployment/default/web';
    const params = { context: 'dev' };
    assert.equal((await send('POST', '/api/p/kubernetes/action', { op: 'restart', id, params })).status, 400);
    assert.equal((await send('POST', '/api/p/kubernetes/action', { op: 'restart', id, params, confirm: 'web' })).status, 200);
    assert.deepEqual(lastCluster(cli).slice(2), ['--namespace=default', 'rollout', 'restart', 'deployment/web']);

    assert.equal((await send('POST', '/api/p/kubernetes/action', { op: 'scale', id, params: { ...params, replicas: 3 } })).status, 400);
    assert.equal((await send('POST', '/api/p/kubernetes/action', { op: 'scale', id, params: { ...params, replicas: 500 }, confirm: 'web' })).status, 400);
    assert.equal((await send('POST', '/api/p/kubernetes/action', { op: 'scale', id, params: { ...params, replicas: 3 }, confirm: 'web' })).status, 200);
    assert.deepEqual(lastCluster(cli).slice(2), ['--namespace=default', 'scale', 'deployment/web', '--replicas=3']);
  } finally {
    await srv.close();
  }
});

test('RN-12: operações fora da allowlist, ids inválidos e contexto inválido são recusados sem tocar o cluster', async () => {
  const { srv, cli, send } = await setup();
  try {
    const before = cli.calls.length;
    const bad = [
      { op: 'exec', id: 'pod/ns/x', params: { context: 'dev' } },
      { op: 'apply', id: 'pod/ns/x', params: { context: 'dev' } },
      { op: 'delete', id: '--all', params: { context: 'dev' }, confirm: '--all' },
      { op: 'delete', id: 'node/ns/x', params: { context: 'dev' }, confirm: 'x' },
      { op: 'delete', id: 'pod/ns/x', params: { context: '--all-namespaces' }, confirm: 'x' },
      { op: 'delete', id: 'pod/ns/x', params: {}, confirm: 'x' },
      { op: 'delete', id: 'pod/ns/x', confirm: 'x' },
    ];
    for (const body of bad) assert.equal((await send('POST', '/api/p/kubernetes/action', body)).status, 400, JSON.stringify(body));
    assert.equal(cli.calls.length, before);
  } finally {
    await srv.close();
  }
});

test('RF-20: os logs usam o contexto da consulta e rejeitam services e contexto inválido', async () => {
  const { srv, cli, get } = await setup();
  try {
    const res = await get('/api/p/kubernetes/logs?id=pod/prod/web-abc&context=prod');
    assert.equal(res.json.text, 'log do pod\n');
    assert.deepEqual(lastCluster(cli).slice(0, 5), ['--context=prod', '--request-timeout=10s', '--namespace=prod', 'logs', 'pod/web-abc']);
    assert.equal((await get('/api/p/kubernetes/logs?id=service/prod/web-svc&context=dev')).status, 400);
    assert.equal((await get('/api/p/kubernetes/logs?id=pod/prod/web-abc')).status, 400);
    assert.equal((await get('/api/p/kubernetes/logs?id=pod/prod/web-abc&context=--all')).status, 400);
  } finally {
    await srv.close();
  }
});

test('RN-06: ações no cluster são auditadas, inclusive a recusa por falta da confirmação', async () => {
  const { srv, send } = await setup();
  try {
    await send('POST', '/api/p/kubernetes/action', { op: 'delete', id: 'pod/prod/web-abc', params: { context: 'dev' }, confirm: 'web-abc' });
    const events = srv.readAudit().trim().split(/\r?\n/).map((l) => JSON.parse(l)).filter((e) => e.action.startsWith('kubernetes.'));
    assert.deepEqual(events.map((e) => [e.action, e.target, e.result]), [['kubernetes.delete', 'pod/prod/web-abc', 'ok']]);
  } finally {
    await srv.close();
  }
});
