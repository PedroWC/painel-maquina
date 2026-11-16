'use strict';

// Executor de PowerShell (ADR 0006): scripts ESTÁTICOS enviados com
// -EncodedCommand; os dados do usuário seguem à parte, como JSON na variável de
// ambiente PP_PARAMS. Nada vindo do cliente é concatenado ao texto do script.

const path = require('node:path');
const { execFile: nodeExecFile } = require('node:child_process');
const { HttpError } = require('./validate');

const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

const PREFIX =
  "$ProgressPreference='SilentlyContinue';" +
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  "$ErrorActionPreference='Stop';" +
  '$p=$env:PP_PARAMS|ConvertFrom-Json;\n';

const MAX_ERROR_CHARS = 400;

function encode(script) {
  return Buffer.from(PREFIX + script, 'utf16le').toString('base64');
}

// O PowerShell devolve erros em CLIXML quando usa -EncodedCommand; extrai o texto.
function cleanError(raw) {
  let text = String(raw || '');
  if (text.includes('CLIXML')) {
    const parts = [...text.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) => m[1]);
    text = parts.join('');
  }
  text = text
    .replace(/_x000D__x000A_/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
  return text.slice(0, MAX_ERROR_CHARS) || 'Falha ao executar o comando do sistema.';
}

function createPowerShell({ execFile = nodeExecFile, timeoutMs = 90000, executable = POWERSHELL } = {}) {
  function run(script, params = {}) {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)],
        {
          env: { ...process.env, PP_PARAMS: JSON.stringify(params) },
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          timeout: timeoutMs,
          encoding: 'utf8',
        },
        (err, stdout, stderr) => {
          if (err) {
            if (err.killed) return reject(new HttpError(504, 'Tempo esgotado ao executar o comando do sistema.'));
            return reject(new HttpError(500, cleanError(stderr || err.message)));
          }
          return resolve(stdout);
        },
      );
    });
  }

  async function runJson(script, params = {}) {
    const out = (await run(script, params)).trim();
    if (!out) return null;
    try {
      return JSON.parse(out);
    } catch {
      throw new HttpError(500, 'Resposta inesperada do sistema.');
    }
  }

  return { run, runJson };
}

module.exports = { createPowerShell, encode, cleanError, PREFIX };
