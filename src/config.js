'use strict';

// Leitura, validação e gravação da configuração local (RNF-08, RN-10, RN-16).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const AUDIT_PATH = path.join(ROOT, 'audit.log');

const DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 8780,
  tokenHash: '',
  allowedHosts: [],
  sessionHours: 12,
  maxTerminals: 20,
});

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isLoopback(host) {
  return LOOPBACK_HOSTS.has(String(host).toLowerCase());
}

function normalize(raw, env = {}) {
  const cfg = { ...DEFAULTS, allowedHosts: [], ...raw };
  if (env.PAINEL_HOST) cfg.host = env.PAINEL_HOST;
  if (env.PAINEL_PORT) cfg.port = Number(env.PAINEL_PORT);

  if (typeof cfg.host !== 'string' || cfg.host === '') {
    throw new Error('Configuração inválida: host deve ser um texto não vazio.');
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
    throw new Error('Configuração inválida: port deve ser um inteiro entre 1 e 65535.');
  }
  if (typeof cfg.tokenHash !== 'string') {
    throw new Error('Configuração inválida: tokenHash deve ser um texto.');
  }
  if (!Array.isArray(cfg.allowedHosts) || !cfg.allowedHosts.every((h) => typeof h === 'string' && h)) {
    throw new Error('Configuração inválida: allowedHosts deve ser uma lista de textos.');
  }
  if (typeof cfg.sessionHours !== 'number' || !(cfg.sessionHours > 0) || cfg.sessionHours > 168) {
    throw new Error('Configuração inválida: sessionHours deve ser maior que 0 e no máximo 168.');
  }
  if (!Number.isInteger(cfg.maxTerminals) || cfg.maxTerminals < 1 || cfg.maxTerminals > 100) {
    throw new Error('Configuração inválida: maxTerminals deve ser um inteiro entre 1 e 100.');
  }

  // RN-10: fora do loopback exige allowedHosts e é sinalizado como exposto.
  cfg.exposed = !isLoopback(cfg.host);
  if (cfg.exposed && cfg.allowedHosts.length === 0) {
    throw new Error('Escutar fora do loopback exige allowedHosts preenchido (RN-10).');
  }
  return Object.freeze(cfg);
}

function readRawConfig(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Não foi possível ler a configuração em ${path.basename(file)} (JSON inválido).`);
  }
}

function loadConfig({ file = CONFIG_PATH, env = process.env } = {}) {
  return normalize(readRawConfig(file), env);
}

function saveConfig(file, raw) {
  const { exposed: _exposed, ...persisted } = raw;
  fs.writeFileSync(file, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

// Restringe o arquivo ao usuário atual, SYSTEM e Administradores (melhor esforço).
function restrictFilePermissions(file) {
  if (process.platform !== 'win32') return false;
  const user = `${process.env.USERDOMAIN || ''}\\${process.env.USERNAME || ''}`;
  try {
    execFileSync(
      'icacls',
      [file, '/inheritance:r', '/grant:r', `${user}:F`, '*S-1-5-18:F', '*S-1-5-32-544:F'],
      { stdio: 'ignore', windowsHide: true },
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  CONFIG_PATH,
  AUDIT_PATH,
  DEFAULTS,
  isLoopback,
  normalize,
  readRawConfig,
  loadConfig,
  saveConfig,
  restrictFilePermissions,
};
