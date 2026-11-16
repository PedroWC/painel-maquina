'use strict';

// Provedor Kubernetes (RF-20, RN-13): pods, deployments e services pela CLI `kubectl`.
//
// - Nunca altera o kubeconfig: o contexto e o namespace escolhidos na interface viajam em cada
//   comando (--context=, --namespace=); o contexto "atual" do kubectl não é trocado.
// - O contexto e o namespace ativos ficam sempre visíveis (banner) e selecionáveis.
// - Operações destrutivas exigem digitar o nome do recurso (confirmaPorNome).
// - Só execFile com argumentos validados (ADR 0010, RN-12); --request-timeout evita travar a aba
//   quando o cluster não responde.

const { HttpError, badRequest, int } = require('../validate');
const { defineProvider, humanDuration } = require('./base');

const EXECUTABLE = 'kubectl';
const REQUEST_TIMEOUT = '--request-timeout=10s';
const LOG_LINES = '300';
const MAX_REPLICAS = 100;

const CONTEXT = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,252}$/;
const NAMESPACE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const KINDS = ['pod', 'deployment', 'service'];

const UNREACHABLE =
  /unable to connect to the server|connection refused|dial tcp|no such host|i\/o timeout|client\.timeout|context deadline exceeded|actively refused|tls handshake timeout/i;
const FORBIDDEN = /forbidden|unauthorized|you must be logged in|provide credentials/i;

// Mensagens amigáveis para os dois problemas mais comuns, sem despejar o erro bruto do kubectl.
function friendly(err, context) {
  if (!(err instanceof HttpError) || err.status !== 502) return err;
  if (UNREACHABLE.test(err.message)) {
    return new HttpError(503, `Não foi possível conectar ao cluster do contexto "${context}". Verifique se o cluster está em execução e acessível.`);
  }
  if (FORBIDDEN.test(err.message)) {
    return new HttpError(403, `O cluster recusou a operação por falta de permissão no contexto "${context}".`);
  }
  return err;
}

function validContext(value) {
  if (typeof value !== 'string' || !CONTEXT.test(value)) throw badRequest('contexto inválido.');
  return value;
}

// id do recurso: kind/namespace/nome (por exemplo, deployment/prod/web).
function parseId(id) {
  const parts = typeof id === 'string' ? id.split('/') : [];
  const [kind, namespace, name] = parts;
  if (parts.length !== 3 || !KINDS.includes(kind) || !NAMESPACE.test(namespace) || !NAME.test(name)) {
    throw badRequest('identificador inválido.');
  }
  return { kind, namespace, name };
}

function ageOf(timestamp, now) {
  const created = Date.parse(timestamp);
  if (Number.isNaN(created)) return '—';
  return humanDuration(Math.max(0, Math.floor((now() - created) / 1000)));
}

function podRow(pod, namespace, now) {
  const statuses = pod.status?.containerStatuses || [];
  const total = (pod.spec?.containers || []).length || statuses.length;
  const ready = statuses.filter((c) => c.ready).length;
  const restarts = statuses.reduce((sum, c) => sum + (c.restartCount || 0), 0);
  const waiting = statuses.map((c) => c.state?.waiting?.reason).find(Boolean);
  const phase = pod.status?.phase || 'Unknown';

  let status;
  if (pod.metadata.deletionTimestamp) status = { texto: 'Terminating', tom: 'off' };
  else if (waiting) status = { texto: waiting, tom: ['ContainerCreating', 'PodInitializing'].includes(waiting) ? 'off' : 'mau' };
  else if (phase === 'Running') status = { texto: ready === total ? 'Running' : 'Running (não pronto)', tom: ready === total ? 'ok' : 'off' };
  else if (phase === 'Failed') status = { texto: 'Failed', tom: 'mau' };
  else status = { texto: phase, tom: 'off' };

  return {
    id: `pod/${namespace}/${pod.metadata.name}`,
    nomeConfirmacao: pod.metadata.name,
    cells: {
      nome: pod.metadata.name,
      pronto: `${ready}/${total}`,
      reinicios: restarts,
      node: pod.spec?.nodeName || '—',
      idade: ageOf(pod.metadata.creationTimestamp, now),
    },
    status,
    actions: ['delete'],
    logs: true,
  };
}

function deploymentRow(deployment, namespace, now) {
  const desired = deployment.spec?.replicas ?? 0;
  const ready = deployment.status?.readyReplicas ?? 0;
  let status;
  if (desired === 0) status = { texto: 'Escalado a zero', tom: 'off' };
  else if (ready === desired) status = { texto: 'Pronto', tom: 'ok' };
  else if (ready === 0) status = { texto: 'Sem réplicas prontas', tom: 'mau' };
  else status = { texto: 'Parcial', tom: 'off' };

  return {
    id: `deployment/${namespace}/${deployment.metadata.name}`,
    nomeConfirmacao: deployment.metadata.name,
    padroes: { replicas: String(desired) },
    cells: {
      nome: deployment.metadata.name,
      pronto: `${ready}/${desired}`,
      atualizados: deployment.status?.updatedReplicas ?? 0,
      disponiveis: deployment.status?.availableReplicas ?? 0,
      idade: ageOf(deployment.metadata.creationTimestamp, now),
    },
    status,
    actions: ['restart', 'scale', 'delete'],
    logs: true,
  };
}

function serviceRow(service, namespace, now) {
  const ports = (service.spec?.ports || []).map((p) => `${p.port}/${p.protocol || 'TCP'}`).join(', ');
  return {
    id: `service/${namespace}/${service.metadata.name}`,
    nomeConfirmacao: service.metadata.name,
    cells: {
      nome: service.metadata.name,
      tipo: service.spec?.type || '—',
      ip: service.spec?.clusterIP || '—',
      portas: ports || '—',
      idade: ageOf(service.metadata.creationTimestamp, now),
    },
    actions: ['delete'],
    logs: false,
  };
}

function createKubernetesProvider({ cli, now = Date.now }) {
  const cluster = async (context, args, options) => {
    try {
      return await cli.run(EXECUTABLE, [`--context=${context}`, REQUEST_TIMEOUT, ...args], options);
    } catch (err) {
      throw friendly(err, context);
    }
  };

  async function detect() {
    try {
      const { stdout } = await cli.run(EXECUTABLE, ['version', '--client', '-o', 'json']);
      let version = '';
      try {
        version = String(JSON.parse(stdout).clientVersion.gitVersion || '');
      } catch {
        version = '';
      }
      return { disponivel: true, versao: version.replace(/^v/, '') || 'desconhecida' };
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { disponivel: false };
      throw err;
    }
  }

  async function contexts() {
    const { stdout } = await cli.run(EXECUTABLE, ['config', 'get-contexts', '-o', 'name']);
    return stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }

  async function currentContext() {
    try {
      return (await cli.run(EXECUTABLE, ['config', 'current-context'])).stdout.trim();
    } catch {
      return ''; // sem contexto atual definido
    }
  }

  async function defaultNamespace(context) {
    try {
      const { stdout } = await cli.run(EXECUTABLE, ['config', 'view', '--minify', `--context=${context}`, '--output=jsonpath={..namespace}']);
      return stdout.trim() || 'default';
    } catch {
      return 'default';
    }
  }

  const COLUMNS = {
    deployments: [
      { key: 'nome', title: 'Nome' },
      { key: 'pronto', title: 'Prontos' },
      { key: 'atualizados', title: 'Atualizados' },
      { key: 'disponiveis', title: 'Disponíveis' },
      { key: 'idade', title: 'Idade' },
    ],
    pods: [
      { key: 'nome', title: 'Nome' },
      { key: 'pronto', title: 'Prontos' },
      { key: 'reinicios', title: 'Reinícios' },
      { key: 'node', title: 'Node' },
      { key: 'idade', title: 'Idade' },
    ],
    services: [
      { key: 'nome', title: 'Nome' },
      { key: 'tipo', title: 'Tipo' },
      { key: 'ip', title: 'IP do cluster' },
      { key: 'portas', title: 'Portas' },
      { key: 'idade', title: 'Idade' },
    ],
  };

  const sections = (rows) => [
    { id: 'deployments', title: 'Deployments', empty: 'Nenhum deployment neste namespace.', columns: COLUMNS.deployments, rows: rows.deployments },
    { id: 'pods', title: 'Pods', empty: 'Nenhum pod neste namespace.', columns: COLUMNS.pods, rows: rows.pods },
    { id: 'services', title: 'Services', empty: 'Nenhum service neste namespace.', columns: COLUMNS.services, rows: rows.services },
  ];

  async function list(query = {}) {
    const known = await contexts();
    if (known.length === 0) {
      return { aviso: 'Nenhum contexto do kubectl foi encontrado. Configure o kubeconfig para usar este provedor.', controles: [], sections: [] };
    }
    const current = await currentContext();
    const context = known.includes(query.context) ? query.context : known.includes(current) ? current : known[0];

    // Namespaces: se o cluster não responde, a aba continua com os seletores para trocar de contexto.
    let namespaces = null;
    let aviso = null;
    try {
      const { stdout } = await cluster(context, ['get', 'namespaces', '-o', 'json']);
      namespaces = JSON.parse(stdout).items.map((i) => i.metadata.name).sort();
    } catch (err) {
      if (err instanceof HttpError && err.status === 503) aviso = err.message;
      else if (!(err instanceof HttpError && err.status === 403)) throw err; // 403: sem permissão para listar namespaces
    }

    const fallback = await defaultNamespace(context);
    let namespace = fallback;
    if (typeof query.namespace === 'string' && (namespaces ? namespaces.includes(query.namespace) : NAMESPACE.test(query.namespace))) {
      namespace = query.namespace;
    } else if (namespaces && !namespaces.includes(fallback)) {
      namespace = namespaces[0] || fallback;
    }

    const base = {
      contexto: `Contexto: ${context} · Namespace: ${namespace}`, // RN-13: sempre visível
      controles: [
        { id: 'context', rotulo: 'Contexto', valor: context, reinicia: ['namespace'], opcoes: known.map((c) => ({ valor: c, rotulo: c })) },
        { id: 'namespace', rotulo: 'Namespace', valor: namespace, opcoes: (namespaces || [namespace]).map((n) => ({ valor: n, rotulo: n })) },
      ],
    };
    if (aviso) return { ...base, aviso, sections: [] };

    let items;
    try {
      const { stdout } = await cluster(context, [`--namespace=${namespace}`, 'get', 'pods,deployments,services', '-o', 'json']);
      items = JSON.parse(stdout).items || [];
    } catch (err) {
      if (err instanceof HttpError && (err.status === 503 || err.status === 403)) return { ...base, aviso: err.message, sections: [] };
      if (err instanceof SyntaxError) throw new HttpError(502, 'Resposta inesperada do kubectl.');
      throw err;
    }

    const rows = { deployments: [], pods: [], services: [] };
    for (const item of items) {
      if (item.kind === 'Deployment') rows.deployments.push(deploymentRow(item, namespace, now));
      else if (item.kind === 'Pod') rows.pods.push(podRow(item, namespace, now));
      else if (item.kind === 'Service') rows.services.push(serviceRow(item, namespace, now));
    }
    return { ...base, sections: sections(rows) };
  }

  async function logs(id, query = {}) {
    const target = parseId(id);
    if (target.kind === 'service') throw badRequest('Services não têm logs; veja os pods.');
    const context = validContext(query.context);
    const { stdout, stderr } = await cluster(context, [
      `--namespace=${target.namespace}`,
      'logs',
      `${target.kind}/${target.name}`,
      `--tail=${LOG_LINES}`,
      '--timestamps',
      '--all-containers=true',
      '--prefix',
    ]);
    return `${stdout}${stderr}`;
  }

  const withContext = (params) => ({ context: validContext(params && params.context) });

  function requireDeployment(target, message) {
    if (target.kind !== 'deployment') throw badRequest(message);
  }

  return defineProvider({
    id: 'kubernetes',
    nome: 'Kubernetes',
    confirmaPorNome: true, // RN-13
    detect,
    list,
    logs,
    validateId(id) {
      parseId(id);
      return id;
    },
    nomeConfirmacao: (id) => parseId(id).name,
    actions: {
      restart: {
        rotulo: 'Reiniciar rollout',
        destrutiva: true,
        validar: withContext,
        run: async (id, params) => {
          const target = parseId(id);
          requireDeployment(target, 'Somente deployments têm rollout para reiniciar.');
          return cluster(params.context, [`--namespace=${target.namespace}`, 'rollout', 'restart', `deployment/${target.name}`]);
        },
      },
      scale: {
        rotulo: 'Escalar',
        destrutiva: true,
        campos: [{ id: 'replicas', rotulo: `Número de réplicas (0 a ${MAX_REPLICAS})`, inteiro: true, max: 3 }],
        validar: (params) => ({
          ...withContext(params),
          replicas: int(params && params.replicas, { field: 'réplicas', min: 0, max: MAX_REPLICAS }),
        }),
        run: async (id, params) => {
          const target = parseId(id);
          requireDeployment(target, 'Somente deployments podem ser escalados.');
          return cluster(params.context, [`--namespace=${target.namespace}`, 'scale', `deployment/${target.name}`, `--replicas=${params.replicas}`]);
        },
      },
      delete: {
        rotulo: 'Excluir',
        destrutiva: true,
        validar: withContext,
        run: async (id, params) => {
          const target = parseId(id);
          return cluster(params.context, [`--namespace=${target.namespace}`, 'delete', `${target.kind}/${target.name}`, '--wait=false']);
        },
      },
    },
  });
}

module.exports = { createKubernetesProvider, friendly, parseId };
