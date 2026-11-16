'use strict';

// Rotas dos provedores (RF-15, RF-16, RF-23; RN-05, RN-11, RN-12, RN-14).

const { HttpError, badRequest, str } = require('../validate');
const { withTimeout } = require('../providers/registry');

const DEFAULT_TIMEOUT_MS = 20000;
const PID = '(?<pid>[a-z0-9-]{1,20})';
const MAX_QUERY_PARAMS = 10;
const MAX_QUERY_KEY = 50;
const MAX_QUERY_VALUE = 300;

// Parâmetros de consulta repassados ao provedor (por exemplo, contexto e namespace do Kubernetes).
// Objeto sem protótipo, com limites de quantidade e tamanho; o provedor valida cada valor.
function queryOf(url) {
  const query = Object.create(null);
  for (const [key, value] of url.searchParams) {
    if (Object.keys(query).length >= MAX_QUERY_PARAMS) break;
    if (key === '__proto__') continue;
    query[key.slice(0, MAX_QUERY_KEY)] = value.slice(0, MAX_QUERY_VALUE);
  }
  return query;
}

function createProviderRoutes({ registry, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  // RN-11: provedor ausente responde 404, como se a rota não existisse.
  function provider(pid) {
    const found = registry.get(pid);
    if (!found) throw new HttpError(404, 'Provedor não disponível.');
    return found;
  }

  // RN-14: tempo limite e isolamento; um erro aqui só afeta esta requisição.
  async function call(p, fn) {
    try {
      return await withTimeout(Promise.resolve().then(fn), p.timeoutMs || timeoutMs, `Tempo esgotado no provedor ${p.nome}.`);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error(`Falha no provedor ${p.id}:`, err && err.message);
      throw new HttpError(502, `Falha no provedor ${p.nome}.`);
    }
  }

  const meta = (p) => ({
    id: p.id,
    nome: p.nome,
    confirmaPorNome: Boolean(p.confirmaPorNome),
    acoes: Object.fromEntries(
      Object.entries(p.actions).map(([op, a]) => [
        op,
        { rotulo: a.rotulo, destrutiva: a.destrutiva, confirmarNome: Boolean(a.confirmarNome), campos: a.campos || [] },
      ]),
    ),
    temLogs: typeof p.logs === 'function',
  });

  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/providers$/,
      handler: () => ({ providers: registry.list() }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/providers\/refresh$/,
      handler: async ({ audit, ip }) => {
        const providers = await registry.refresh();
        audit.record({ ip, action: 'provedores.detectar', result: 'ok' });
        return { providers };
      },
    },
    {
      method: 'GET',
      pattern: new RegExp(`^/api/p/${PID}/items$`),
      handler: async ({ params, url }) => {
        const p = provider(params.pid);
        const data = await call(p, () => p.list(queryOf(url)));
        return { ...meta(p), ...data };
      },
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/p/${PID}/action$`),
      handler: async ({ params, body, audit, ip }) => {
        const p = provider(params.pid);
        // RN-12: só operações da allowlist do provedor.
        const op = str(body.op, { field: 'operação', max: 30 });
        if (!Object.hasOwn(p.actions, op)) throw badRequest(`Operação inválida: ${op}.`);
        const action = p.actions[op];
        const id = p.validateId(body.id);

        // RN-05 / RN-13: operações destrutivas de provedores que exigem o nome do recurso. O texto
        // esperado é o próprio id, salvo se o provedor define outro (o Kubernetes pede só o nome).
        const expected = typeof p.nomeConfirmacao === 'function' ? p.nomeConfirmacao(id) : id;
        if (action.destrutiva && (action.confirmarNome || p.confirmaPorNome) && body.confirm !== expected) {
          throw badRequest('Confirmação inválida: digite o nome do recurso para continuar.');
        }
        const parameters = action.validar ? action.validar(body.params) : {};
        try {
          await call(p, () => action.run(id, parameters));
        } catch (err) {
          audit.record({ ip, action: `${p.id}.${op}`, target: id, result: 'falha' });
          throw err;
        }
        audit.record({ ip, action: `${p.id}.${op}`, target: id, result: 'ok' });
        return { ok: true };
      },
    },
    {
      method: 'GET',
      pattern: new RegExp(`^/api/p/${PID}/logs$`),
      handler: async ({ params, url }) => {
        const p = provider(params.pid);
        if (typeof p.logs !== 'function') throw new HttpError(404, 'Este provedor não oferece logs.');
        const id = p.validateId(url.searchParams.get('id'));
        const text = await call(p, () => p.logs(id, queryOf(url)));
        return { text: String(text) };
      },
    },
  ];

  return { routes };
}

module.exports = { createProviderRoutes };
