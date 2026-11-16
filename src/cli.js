'use strict';

// Executor de ferramentas externas (ADR 0010, RN-12): execFile com lista de
// argumentos (sem shell), tempo limite e erros padronizados.

const { execFile: nodeExecFile } = require('node:child_process');
const { HttpError } = require('./validate');

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_ERROR_CHARS = 400;

function cleanCliError(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  return text.split('\n').slice(0, 4).join('\n').slice(0, MAX_ERROR_CHARS) || 'Falha ao executar a ferramenta.';
}

function createCli({ execFile = nodeExecFile, timeoutMs = 20000 } = {}) {
  // Devolve { stdout, stderr }. Erros viram HttpError: 404 (não instalada), 504 (tempo) ou 502 (falha).
  function run(executable, args, { timeoutMs: limit = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        args,
        { windowsHide: true, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: limit },
        (err, stdout, stderr) => {
          if (!err) return resolve({ stdout, stderr });
          if (err.code === 'ENOENT') {
            return reject(new HttpError(404, `${executable} não está instalado ou não está no PATH.`));
          }
          if (err.killed) return reject(new HttpError(504, `Tempo esgotado ao executar ${executable}.`));
          return reject(new HttpError(502, cleanCliError(stderr || stdout || err.message)));
        },
      );
    });
  }
  return { run };
}

module.exports = { createCli, cleanCliError };
