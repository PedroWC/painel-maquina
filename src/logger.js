'use strict';

// Log em arquivo para quando o painel roda sem console (tarefa agendada, sem janela).
// Espelha o console.* em um arquivo, com data e nível. Nunca recebe segredos: o painel
// só registra início, parada e erros genéricos.

const fs = require('node:fs');
const util = require('node:util');

const MAX_BYTES = 5 * 1024 * 1024;
const LEVELS = ['log', 'info', 'warn', 'error'];

// Mantém no máximo um arquivo de backup (<arquivo>.1) quando o log passa do limite.
function rotate(file, maxBytes) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) fs.renameSync(file, `${file}.1`);
  } catch {
    // sem rotação, o log só continua crescendo; não impede o painel de iniciar
  }
}

function installFileLogger({ file, maxBytes = MAX_BYTES, now = () => new Date(), target = console }) {
  rotate(file, maxBytes);
  const original = {};
  for (const level of LEVELS) {
    original[level] = target[level]; // guardada como estava, para restaurar exatamente
    const call = original[level].bind(target);
    target[level] = (...args) => {
      const line = `${now().toISOString()} [${level}] ${util.format(...args)}\n`;
      try {
        fs.appendFileSync(file, line, 'utf8');
      } catch {
        // falha ao gravar o log nunca derruba o painel
      }
      call(...args);
    };
  }
  return () => {
    for (const level of LEVELS) target[level] = original[level];
  };
}

module.exports = { installFileLogger, rotate, MAX_BYTES };
