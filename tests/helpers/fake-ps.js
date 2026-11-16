'use strict';

// PowerShell simulado: registra scripts e parâmetros e devolve respostas programadas.

function createFakePs({ listResult = [], failWith } = {}) {
  const calls = [];
  return {
    calls,
    run: async (script, params) => {
      calls.push({ script, params });
      if (failWith) throw failWith(script, params);
      return 'ok';
    },
    runJson: async (script, params) => {
      calls.push({ script, params });
      if (failWith) throw failWith(script, params);
      return listResult;
    },
  };
}

module.exports = { createFakePs };
