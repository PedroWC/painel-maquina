'use strict';

// CLI simulada: registra as chamadas e responde conforme o handler (devolve
// { stdout, stderr } ou lança HttpError).

function createFakeCli(handler = () => ({ stdout: '', stderr: '' })) {
  const calls = [];
  return {
    calls,
    run: async (executable, args, options) => {
      calls.push({ executable, args, options });
      const out = await handler(executable, args, options);
      return { stdout: '', stderr: '', ...out };
    },
  };
}

module.exports = { createFakeCli };
