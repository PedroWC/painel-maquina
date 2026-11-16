'use strict';

// Auditoria em JSON Lines (RN-06, RF-24, RNF-07). Nunca grava segredos:
// chaves sensíveis são omitidas antes da escrita.

const fs = require('node:fs');

const SENSITIVE_KEY = /token|cookie|password|senha|secret|hash|authorization|sid|input|data/i;
const MAX_DEPTH = 4;

function sanitize(value, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[omitido]';
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[omitido]' : sanitize(item, depth + 1);
  }
  return out;
}

function createAudit({ file, now = () => new Date() }) {
  function record(entry) {
    const line = JSON.stringify({ ts: now().toISOString(), ...sanitize(entry) });
    try {
      fs.appendFileSync(file, `${line}\n`, 'utf8');
    } catch {
      console.error('Falha ao gravar a auditoria.');
    }
  }
  return { record };
}

module.exports = { createAudit, sanitize };
