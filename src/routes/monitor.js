'use strict';

// Rota do dashboard de recursos (RF-28 a RF-30). Encerrar processos usa a rota já existente
// POST /api/processes/kill, com as mesmas proteções (RN-04, RN-20).

const { HttpError, oneOf } = require('../validate');

const MODES = ['resumo', 'detalhado'];
const SORTS = ['cpu', 'ram', 'gpu', 'nome'];
const SUMMARY_PROGRAMS = 8;
const SUMMARY_WINDOWS = 3;

const sorters = {
  cpu: (a, b) => b.cpu - a.cpu || b.ramMb - a.ramMb,
  ram: (a, b) => b.ramMb - a.ramMb || b.cpu - a.cpu,
  gpu: (a, b) => (b.gpu || 0) - (a.gpu || 0) || b.cpu - a.cpu,
  nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.pid - b.pid,
};

function createMonitorRoutes({ monitor }) {
  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/monitor$/,
      handler: async ({ url }) => {
        const mode = oneOf(url.searchParams.get('mode') || 'resumo', MODES, 'modo');
        const sort = oneOf(url.searchParams.get('sort') || 'cpu', SORTS, 'ordem');
        let data;
        try {
          data = await monitor.snapshot();
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(503, 'Não foi possível ler os recursos da máquina agora. Tente novamente.');
        }
        const { procs, ...overview } = data;
        const ordered = [...procs].sort(sorters[sort]);
        if (mode === 'detalhado') return { ...overview, mode, sort, procs: ordered };
        return {
          ...overview,
          mode,
          sort,
          programs: ordered.filter((p) => p.category === 'programa').slice(0, SUMMARY_PROGRAMS),
          windows: ordered.filter((p) => p.category === 'windows').slice(0, SUMMARY_WINDOWS),
        };
      },
    },
  ];
  return { routes };
}

module.exports = { createMonitorRoutes, MODES, SORTS };
