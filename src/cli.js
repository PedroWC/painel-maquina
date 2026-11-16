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

// Algumas ferramentas do Windows (como o wsl.exe) escrevem em UTF-16LE. Com encoding 'auto' a saída
// é lida como bytes e decodificada: UTF-16LE se houver bytes nulos, senão UTF-8.
function decodeOutput(output) {
  if (typeof output === 'string') return output;
  if (!Buffer.isBuffer(output)) return '';
  const text = output.includes(0) ? output.toString('utf16le') : output.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // remove o BOM, se houver
}

function createCli({ execFile = nodeExecFile, timeoutMs = 20000 } = {}) {
  // Devolve { stdout, stderr }. Erros viram HttpError: 404 (não instalada), 504 (tempo) ou 502 (falha).
  function run(executable, args, { timeoutMs: limit = timeoutMs, encoding = 'utf8' } = {}) {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        args,
        { windowsHide: true, encoding: encoding === 'auto' ? 'buffer' : 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: limit },
        (err, rawOut, rawErr) => {
          const stdout = decodeOutput(rawOut);
          const stderr = decodeOutput(rawErr);
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

module.exports = { createCli, cleanCliError, decodeOutput };
