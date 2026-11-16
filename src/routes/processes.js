'use strict';

// Rotas de processos e portas (RF-17, RF-25, RN-04).

const { HttpError, int } = require('../validate');
const { assertProcessAllowed } = require('../protections');
const { PROCESS_LIST, PROCESS_KILL } = require('../ps-scripts');

const MAX_PID = 4194304;

// protectedPids: () => Set de PIDs do painel e dos terminais (consultado a cada chamada).
function createProcessRoutes({ ps, protectedPids }) {
  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/processes$/,
      handler: async () => {
        const data = (await ps.runJson(PROCESS_LIST, {})) || {};
        const guarded = protectedPids();
        const mark = (item) => ({ ...item, protected: guarded.has(item.pid) || item.pid <= 4 });
        return {
          procs: (Array.isArray(data.procs) ? data.procs : []).map(mark),
          ports: (Array.isArray(data.ports) ? data.ports : []).map(mark),
        };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/processes\/kill$/,
      handler: async ({ body, audit, ip }) => {
        const pid = int(body.pid, { field: 'pid', min: 0, max: MAX_PID });
        assertProcessAllowed(pid, protectedPids());
        let name;
        try {
          name = (await ps.run(PROCESS_KILL, { pid })).trim();
        } catch (err) {
          audit.record({ ip, action: 'processo.encerrar', target: String(pid), result: 'falha' });
          if (String(err.message).includes('PROCESSO_NAO_EXISTE')) throw new HttpError(404, 'Processo não encontrado.');
          throw err;
        }
        audit.record({ ip, action: 'processo.encerrar', target: String(pid), result: 'ok', detail: { name } });
        return { ok: true };
      },
    },
  ];

  return { routes };
}

module.exports = { createProcessRoutes };
