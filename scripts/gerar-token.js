'use strict';

// Gera um novo token, grava só o hash no config.json e mostra o token uma única vez (RN-16).

const fs = require('node:fs');
const { generateToken, hashToken } = require('../src/auth');
const {
  CONFIG_PATH,
  DEFAULTS,
  readRawConfig,
  saveConfig,
  restrictFilePermissions,
} = require('../src/config');

const replacing = Boolean(readRawConfig(CONFIG_PATH).tokenHash);
const token = generateToken();
const raw = { ...DEFAULTS, ...readRawConfig(CONFIG_PATH), tokenHash: hashToken(token) };

saveConfig(CONFIG_PATH, raw);
const restricted = fs.existsSync(CONFIG_PATH) && restrictFilePermissions(CONFIG_PATH);

console.log(replacing ? 'Token anterior substituído.' : 'Configuração criada.');
console.log('');
console.log('Seu token de acesso (exibido uma única vez, guarde-o em um gerenciador de senhas):');
console.log('');
console.log(`  ${token}`);
console.log('');
if (!restricted) console.log('Aviso: não foi possível restringir as permissões do config.json.');
console.log('Reinicie o painel para que o novo token passe a valer.');
