'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKubernetesProvider, friendly, parseId } = require('../../../src/providers/kubernetes');
const { createFakeCli } = require('../../helpers/fake-cli');
const { HttpError } = require('../../../src/validate');

const NOW = Date.parse('2026-01-01T12:00:00Z');
const created = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();

const pod = (name, overrides = {}) => ({
  kind: 'Pod',
  metadata: { name, creationTimestamp: created(125), ...overrides.metadata },
  spec: { nodeName: 'node-1', containers: [{ name: 'app' }], ...overrides.spec },
  status: { phase: 'Running', containerStatuses: [{ ready: true, restartCount: 0 }], ...overrides.status },
});

const deployment = (name, replicas, ready) => ({
  kind: 'Deployment',
  metadata: { name, creationTimestamp: created(60 * 24 * 3) },
  spec: { replicas },
  status: { readyReplicas: ready, updatedReplicas: ready, availableReplicas: ready },
});

const service = (name) => ({
  kind: 'Service',
  metadata: { name, creationTimestamp: created(10) },
  spec: { type: 'ClusterIP', clusterIP: '10.0.0.5', ports: [{ port: 80, protocol: 'TCP' }, { port: 443 }] },
});

const RESOURCES = [
  pod('web-1', { status: { containerStatuses: [{ ready: true, restartCount: 2 }, { ready: true, restartCount: 1 }] }, spec: { containers: [{}, {}] } }),
  pod('crash-1', { status: { containerStatuses: [{ ready: false, restartCount: 9, state: { waiting: { reason: 'CrashLoopBackOff' } } }] } }),
  pod('criando-1', { status: { phase: 'Pending', containerStatuses: [{ ready: false, state: { waiting: { reason: 'ContainerCreating' } } }] } }),
  pod('pendente-1', { status: { phase: 'Pending', containerStatuses: [] } }),
  pod('feito-1', { status: { phase: 'Succeeded', containerStatuses: [{ ready: false }] } }),
  pod('falhou-1', { status: { phase: 'Failed', containerStatuses: [{ ready: false }] } }),
  pod('saindo-1', { metadata: { deletionTimestamp: created(1) } }),
  pod('quase-1', { spec: { containers: [{}, {}] }, status: { containerStatuses: [{ ready: true }, { ready: false }] } }),
  deployment('web', 3, 3),
  deployment('api', 2, 1),
  deployment('parado', 0, 0),
  deployment('quebrado', 2, 0),
  service('web-svc'),
];

function router({ contexts = 'dev\nprod\n', current = 'dev', ns = '', namespaces = ['default', 'prod', 'staging'], resources = RESOURCES, fail } = {}) {
  return (exe, args) => {
    const failure = fail && fail(args);
    if (failure) throw failure;
    if (args[0] === 'version') return { stdout: JSON.stringify({ clientVersion: { gitVersion: 'v1.30.2' } }) };
    if (args[0] === 'config' && args[1] === 'get-contexts') return { stdout: contexts };
    if (args[0] === 'config' && args[1] === 'current-context') {
      if (!current) throw new HttpError(502, 'error: current-context is not set');
      return { stdout: `${current}\n` };
    }
    if (args[0] === 'config' && args[1] === 'view') return { stdout: ns };
    const verb = args.findIndex((a) => !a.startsWith('--'));
    if (args[verb] === 'get' && args[verb + 1] === 'namespaces') return { stdout: JSON.stringify({ items: namespaces.map((n) => ({ metadata: { name: n } })) }) };
    if (args[args.indexOf('get')] === 'get') return { stdout: JSON.stringify({ items: resources }) };
    return { stdout: '' };
  };
}

function setup(options) {
  const cli = createFakeCli(router(options));
  return { cli, provider: createKubernetesProvider({ cli, now: () => NOW }) };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;
const clusterCalls = (cli) => cli.calls.filter((c) => c.args.some((a) => a.startsWith('--context=')));

test('RF-20: detecta a versão do kubectl sem contatar nenhum cluster', async () => {
  const { provider, cli } = setup();
  assert.deepEqual(await provider.detect(), { disponivel: true, versao: '1.30.2' });
  assert.deepEqual(cli.calls.map((c) => [c.executable, ...c.args]), [['kubectl', 'version', '--client', '-o', 'json']]);
});

test('RN-11: kubectl ausente resulta em provedor indisponível; versão ilegível não derruba a detecção', async () => {
  const absent = createKubernetesProvider({ cli: createFakeCli(() => { throw new HttpError(404, 'kubectl não está instalado'); }) });
  assert.deepEqual(await absent.detect(), { disponivel: false });
  const odd = createKubernetesProvider({ cli: createFakeCli(() => ({ stdout: 'não é json' })) });
  assert.deepEqual(await odd.detect(), { disponivel: true, versao: 'desconhecida' });
  const broken = createKubernetesProvider({ cli: createFakeCli(() => { throw new HttpError(504, 'Tempo esgotado'); }) });
  await assert.rejects(broken.detect(), status(504));
});

test('RN-13: o contexto e o namespace ativos ficam sempre visíveis e selecionáveis', async () => {
  const { provider } = setup({ ns: 'prod' });
  const result = await provider.list();
  assert.equal(result.contexto, 'Contexto: dev · Namespace: prod');
  const [context, namespace] = result.controles;
  assert.deepEqual([context.id, context.valor, context.opcoes.map((o) => o.valor), context.reinicia], ['context', 'dev', ['dev', 'prod'], ['namespace']]);
  assert.deepEqual([namespace.id, namespace.valor, namespace.opcoes.map((o) => o.valor)], ['namespace', 'prod', ['default', 'prod', 'staging']]);
});

test('RF-20: o contexto e o namespace são enviados em cada comando e o kubeconfig nunca é alterado', async () => {
  const { provider, cli } = setup({ ns: 'prod' });
  await provider.list();
  const calls = cli.calls.map((c) => c.args.join(' '));
  assert.ok(calls.includes('config get-contexts -o name'));
  assert.ok(calls.includes('--context=dev --request-timeout=10s get namespaces -o json'));
  assert.ok(calls.includes('--context=dev --request-timeout=10s --namespace=prod get pods,deployments,services -o json'));
  assert.equal(calls.some((c) => c.includes('use-context') || c.includes('set-context') || c.includes('set-cluster')), false);
});

test('RF-20: a consulta escolhe o contexto e o namespace; valores desconhecidos voltam ao padrão', async () => {
  const { provider } = setup({ ns: 'default' });
  const picked = await provider.list({ context: 'prod', namespace: 'staging' });
  assert.equal(picked.contexto, 'Contexto: prod · Namespace: staging');
  const unknown = await provider.list({ context: '--all-namespaces', namespace: '; calc' });
  assert.equal(unknown.contexto, 'Contexto: dev · Namespace: default');
  const wrongNs = await provider.list({ context: 'dev', namespace: 'nao-existe' });
  assert.equal(wrongNs.controles[1].valor, 'default');
});

test('RF-20: sem contexto atual usa o primeiro; sem nenhum contexto avisa o que fazer', async () => {
  const first = await setup({ current: '' }).provider.list();
  assert.equal(first.controles[0].valor, 'dev');
  const none = await setup({ contexts: '' }).provider.list();
  assert.match(none.aviso, /Nenhum contexto/);
  assert.deepEqual(none.sections, []);
});

test('RF-20: sem permissão para listar namespaces a aba continua com o namespace padrão', async () => {
  const fail = (args) => (args.includes('namespaces') ? new HttpError(502, 'namespaces is forbidden: User cannot list') : null);
  const result = await setup({ fail, ns: 'meu-ns' }).provider.list();
  assert.equal(result.aviso, undefined);
  assert.deepEqual(result.controles[1].opcoes.map((o) => o.valor), ['meu-ns']);
  assert.equal(result.sections.length, 3);
});

test('RN-14: com o cluster inacessível a aba responde com aviso amigável e mantém os seletores', async () => {
  const fail = (args) => (args.some((a) => a.startsWith('--context=')) ? new HttpError(502, 'Unable to connect to the server: dial tcp 127.0.0.1:6443: connection refused') : null);
  const result = await setup({ fail }).provider.list();
  assert.match(result.aviso, /Não foi possível conectar ao cluster do contexto "dev"/);
  assert.equal(result.aviso.includes('6443'), false, 'sem o erro bruto');
  assert.deepEqual(result.sections, []);
  assert.equal(result.controles.length, 2, 'ainda dá para trocar de contexto');
  assert.equal(result.contexto, 'Contexto: dev · Namespace: default');
});

test('RN-14: falha só na listagem de recursos também vira aviso; outros erros e respostas inválidas sobem', async () => {
  const denied = (args) => (args.includes('pods,deployments,services') ? new HttpError(502, 'pods is forbidden: User "x" cannot list') : null);
  const result = await setup({ fail: denied }).provider.list();
  assert.match(result.aviso, /falta de permissão/);
  const other = (args) => (args.includes('pods,deployments,services') ? new HttpError(502, 'erro desconhecido') : null);
  await assert.rejects(setup({ fail: other }).provider.list(), status(502));
  const cli = createFakeCli((exe, args) => (args.includes('pods,deployments,services') ? { stdout: 'não é json' } : router()(exe, args)));
  await assert.rejects(createKubernetesProvider({ cli, now: () => NOW }).list(), status(502));
});

test('RF-20: monta as três seções com ids kind/namespace/nome e o texto de confirmação', async () => {
  const { sections } = await setup({ ns: 'prod' }).provider.list();
  assert.deepEqual(sections.map((s) => s.id), ['deployments', 'pods', 'services']);
  const [deployments, pods, services] = sections;
  assert.deepEqual(deployments.rows.map((r) => r.id), ['deployment/prod/web', 'deployment/prod/api', 'deployment/prod/parado', 'deployment/prod/quebrado']);
  assert.equal(pods.rows[0].id, 'pod/prod/web-1');
  assert.equal(pods.rows[0].nomeConfirmacao, 'web-1');
  assert.equal(services.rows[0].id, 'service/prod/web-svc');
});

test('RF-20: pods mostram prontos, reinícios, node, idade e o estado real', async () => {
  const { sections } = await setup().provider.list();
  const rows = Object.fromEntries(sections[1].rows.map((r) => [r.cells.nome, r]));
  assert.deepEqual(rows['web-1'].cells, { nome: 'web-1', pronto: '2/2', reinicios: 3, node: 'node-1', idade: '2h 5min' });
  assert.deepEqual(rows['web-1'].status, { texto: 'Running', tom: 'ok' });
  assert.deepEqual(rows['crash-1'].status, { texto: 'CrashLoopBackOff', tom: 'mau' });
  assert.deepEqual(rows['criando-1'].status, { texto: 'ContainerCreating', tom: 'off' });
  assert.deepEqual(rows['pendente-1'].status, { texto: 'Pending', tom: 'off' });
  assert.deepEqual(rows['feito-1'].status, { texto: 'Succeeded', tom: 'off' });
  assert.deepEqual(rows['falhou-1'].status, { texto: 'Failed', tom: 'mau' });
  assert.deepEqual(rows['saindo-1'].status, { texto: 'Terminating', tom: 'off' });
  assert.deepEqual(rows['quase-1'].status, { texto: 'Running (não pronto)', tom: 'off' });
  assert.deepEqual(rows['web-1'].actions, ['delete']);
  assert.equal(rows['web-1'].logs, true);
});

test('RF-20: deployments mostram réplicas, estado, valor padrão do escalonamento e ações', async () => {
  const { sections } = await setup().provider.list();
  const rows = Object.fromEntries(sections[0].rows.map((r) => [r.cells.nome, r]));
  assert.deepEqual(rows.web.cells, { nome: 'web', pronto: '3/3', atualizados: 3, disponiveis: 3, idade: '3d 0h' });
  assert.deepEqual(rows.web.status, { texto: 'Pronto', tom: 'ok' });
  assert.deepEqual(rows.api.status, { texto: 'Parcial', tom: 'off' });
  assert.deepEqual(rows.parado.status, { texto: 'Escalado a zero', tom: 'off' });
  assert.deepEqual(rows.quebrado.status, { texto: 'Sem réplicas prontas', tom: 'mau' });
  assert.deepEqual(rows.web.actions, ['restart', 'scale', 'delete']);
  assert.deepEqual(rows.web.padroes, { replicas: '3' });
  assert.equal(rows.web.logs, true);
});

test('RF-20: services listam tipo, IP e portas, e só permitem excluir (sem logs)', async () => {
  const { sections } = await setup().provider.list();
  const [svc] = sections[2].rows;
  assert.deepEqual(svc.cells, { nome: 'web-svc', tipo: 'ClusterIP', ip: '10.0.0.5', portas: '80/TCP, 443/TCP', idade: '10min' });
  assert.deepEqual(svc.actions, ['delete']);
  assert.equal(svc.logs, false);
});

test('RF-20: namespaces vazios geram seções vazias com mensagem', async () => {
  const { sections } = await setup({ resources: [] }).provider.list();
  assert.deepEqual(sections.map((s) => s.rows.length), [0, 0, 0]);
  assert.match(sections[1].empty, /Nenhum pod/);
});

test('RN-12: cada operação monta exatamente os argumentos esperados (sem --force nem --all)', async () => {
  const { provider, cli } = setup();
  const ctx = { context: 'prod' };
  await provider.actions.restart.run('deployment/ns/web', ctx);
  await provider.actions.scale.run('deployment/ns/web', { ...ctx, replicas: 4 });
  await provider.actions.delete.run('pod/ns/web-1', ctx);
  await provider.actions.delete.run('deployment/ns/web', ctx);
  await provider.actions.delete.run('service/ns/web-svc', ctx);
  assert.deepEqual(clusterCalls(cli).map((c) => c.args), [
    ['--context=prod', '--request-timeout=10s', '--namespace=ns', 'rollout', 'restart', 'deployment/web'],
    ['--context=prod', '--request-timeout=10s', '--namespace=ns', 'scale', 'deployment/web', '--replicas=4'],
    ['--context=prod', '--request-timeout=10s', '--namespace=ns', 'delete', 'pod/web-1', '--wait=false'],
    ['--context=prod', '--request-timeout=10s', '--namespace=ns', 'delete', 'deployment/web', '--wait=false'],
    ['--context=prod', '--request-timeout=10s', '--namespace=ns', 'delete', 'service/web-svc', '--wait=false'],
  ]);
  const flat = cli.calls.flatMap((c) => c.args);
  assert.equal(flat.some((a) => /force|--all|grace-period|--now/.test(a)), false);
});

test('RN-12: reiniciar o rollout e escalar valem só para deployments', async () => {
  const { provider, cli } = setup();
  await assert.rejects(provider.actions.restart.run('pod/ns/web-1', { context: 'dev' }), status(400));
  await assert.rejects(provider.actions.scale.run('service/ns/web-svc', { context: 'dev', replicas: 1 }), status(400));
  assert.equal(cli.calls.length, 0);
});

test('RN-17: o contexto das ações é validado e o número de réplicas fica entre 0 e 100', () => {
  const { provider } = setup();
  assert.deepEqual(provider.actions.delete.validar({ context: 'meu-cluster', outro: 'x' }), { context: 'meu-cluster' });
  assert.deepEqual(provider.actions.delete.validar({ context: 'arn:aws:eks:us-east-1:123:cluster/prod' }), { context: 'arn:aws:eks:us-east-1:123:cluster/prod' });
  assert.deepEqual(provider.actions.scale.validar({ context: 'dev', replicas: 0 }), { context: 'dev', replicas: 0 });
  assert.deepEqual(provider.actions.scale.validar({ context: 'dev', replicas: 100 }), { context: 'dev', replicas: 100 });
  for (const params of [undefined, null, {}, { context: '' }, { context: '--all' }, { context: 'a b' }, { context: 'a;b' }, { context: 5 }]) {
    assert.throws(() => provider.actions.delete.validar(params), status(400), JSON.stringify(params));
  }
  for (const replicas of [-1, 101, 1.5, '3', null, undefined, NaN]) {
    assert.throws(() => provider.actions.scale.validar({ context: 'dev', replicas }), status(400), String(replicas));
  }
});

test('RN-12: identificadores só aceitam kind/namespace/nome válidos', () => {
  const { provider } = setup();
  for (const id of ['pod/default/web-1', 'deployment/prod/api', 'service/kube-system/dns.local']) assert.equal(provider.validateId(id), id);
  const bad = [
    '', 'pod', 'pod/ns', 'pod/ns/', 'pod//web', 'pod/ns/web/extra', 'node/ns/web', 'secret/ns/x', 'configmap/ns/x',
    '--all', '-f', 'pod/NS/web', 'pod/ns/WEB', 'pod/ns/web 1', 'pod/ns/web;calc', 'pod/ns/../x', 'pod/-ns/web', 'pod/ns/-web',
    `pod/${'n'.repeat(64)}/web`, undefined, null, 5,
  ];
  for (const id of bad) assert.throws(() => provider.validateId(id), status(400), JSON.stringify(id));
  assert.deepEqual(parseId('deployment/prod/api'), { kind: 'deployment', namespace: 'prod', name: 'api' });
});

test('RN-13: toda ação destrutiva exige digitar o nome do recurso, e o texto esperado é só o nome', () => {
  const { provider } = setup();
  assert.equal(provider.confirmaPorNome, true);
  assert.deepEqual(Object.entries(provider.actions).map(([op, a]) => [op, a.destrutiva]), [['restart', true], ['scale', true], ['delete', true]]);
  assert.equal(provider.nomeConfirmacao('deployment/prod/api'), 'api');
  assert.throws(() => provider.nomeConfirmacao('lixo'), status(400));
});

test('RF-20: o escalonamento descreve o campo de réplicas para a interface', () => {
  const { provider } = setup();
  assert.deepEqual(provider.actions.scale.campos.map((c) => [c.id, c.inteiro]), [['replicas', true]]);
});

test('RF-20: logs de pods e deployments usam o contexto e o namespace do recurso', async () => {
  const { provider, cli } = setup({ ns: 'x' });
  const cli2 = createFakeCli(() => ({ stdout: 'linha 1\n', stderr: 'aviso\n' }));
  const p2 = createKubernetesProvider({ cli: cli2, now: () => NOW });
  assert.equal(await p2.logs('pod/prod/web-1', { context: 'dev' }), 'linha 1\naviso\n');
  assert.deepEqual(cli2.calls[0].args, [
    '--context=dev', '--request-timeout=10s', '--namespace=prod', 'logs', 'pod/web-1', '--tail=300', '--timestamps', '--all-containers=true', '--prefix',
  ]);
  await p2.logs('deployment/prod/web', { context: 'dev' });
  assert.equal(cli2.calls[1].args[4], 'deployment/web');
  await assert.rejects(provider.logs('service/prod/web-svc', { context: 'dev' }), status(400));
  await assert.rejects(provider.logs('pod/prod/web-1', {}), status(400));
  await assert.rejects(provider.logs('pod/prod/web-1', { context: '--all' }), status(400));
  assert.equal(cli.calls.length, 0);
});

test('RN-14: erros do kubectl viram mensagens amigáveis (cluster fora do ar e sem permissão)', async () => {
  const unreachable = new HttpError(502, 'Unable to connect to the server: dial tcp: lookup meu-cluster: no such host');
  const forbidden = new HttpError(502, 'Error from server (Forbidden): pods is forbidden');
  assert.equal(friendly(unreachable, 'prod').status, 503);
  assert.match(friendly(unreachable, 'prod').message, /contexto "prod"/);
  assert.equal(friendly(forbidden, 'prod').status, 403);
  const other = new HttpError(502, 'Error from server (NotFound): deployments.apps "x" not found');
  assert.equal(friendly(other, 'prod'), other);
  const notBadGateway = new HttpError(504, 'Tempo esgotado');
  assert.equal(friendly(notBadGateway, 'prod'), notBadGateway);
  const plain = new Error('x');
  assert.equal(friendly(plain, 'prod'), plain);
  const { provider } = setup({ fail: (args) => (args.includes('delete') ? unreachable : null) });
  await assert.rejects(provider.actions.delete.run('pod/ns/web-1', { context: 'prod' }), status(503));
});
