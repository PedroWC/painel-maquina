'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalize, isLoopback, loadConfig, saveConfig, readRawConfig } = require('../../src/config');

test('RNF-08: valores padrão são seguros', () => {
  const cfg = normalize({});
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 8780);
  assert.equal(cfg.sessionHours, 12);
  assert.equal(cfg.maxTerminals, 20);
  assert.equal(cfg.exposed, false);
  assert.deepEqual(cfg.allowedHosts, []);
});

test('RNF-08: variáveis de ambiente têm precedência sobre o arquivo', () => {
  const cfg = normalize({ port: 9000 }, { PAINEL_PORT: '9100' });
  assert.equal(cfg.port, 9100);
});

test('RNF-08: valores inválidos são recusados com mensagem clara', () => {
  assert.throws(() => normalize({ port: 0 }), /port/);
  assert.throws(() => normalize({ port: 70000 }), /port/);
  assert.throws(() => normalize({ port: 'abc' }), /port/);
  assert.throws(() => normalize({ sessionHours: 0 }), /sessionHours/);
  assert.throws(() => normalize({ sessionHours: 500 }), /sessionHours/);
  assert.throws(() => normalize({ maxTerminals: 0 }), /maxTerminals/);
  assert.throws(() => normalize({ allowedHosts: 'x' }), /allowedHosts/);
  assert.throws(() => normalize({ host: '' }), /host/);
});

test('RN-10: escutar fora do loopback exige allowedHosts', () => {
  assert.throws(() => normalize({ host: '0.0.0.0' }), /RN-10/);
  assert.throws(() => normalize({ host: '192.0.2.10', allowedHosts: [] }), /RN-10/);
});

test('RN-10: fora do loopback com allowedHosts é aceito e sinalizado como exposto', () => {
  const cfg = normalize({ host: '192.0.2.10', allowedHosts: ['painel.exemplo'] });
  assert.equal(cfg.exposed, true);
});

test('RN-10: loopback é reconhecido em IPv4, IPv6 e nome', () => {
  for (const host of ['127.0.0.1', '::1', 'localhost', 'LOCALHOST']) assert.equal(isLoopback(host), true);
  for (const host of ['0.0.0.0', '192.0.2.10', 'exemplo.com']) assert.equal(isLoopback(host), false);
});

test('RN-10: PAINEL_HOST fora do loopback também exige allowedHosts', () => {
  assert.throws(() => normalize({}, { PAINEL_HOST: '0.0.0.0' }), /RN-10/);
});

test('RNF-08: a configuração é lida do arquivo e a ausência do arquivo usa o padrão', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-config-'));
  const file = path.join(dir, 'config.json');
  assert.equal(loadConfig({ file, env: {} }).port, 8780);
  fs.writeFileSync(file, JSON.stringify({ port: 9001 }));
  assert.equal(loadConfig({ file, env: {} }).port, 9001);
  fs.writeFileSync(file, '{ não é json');
  assert.throws(() => loadConfig({ file, env: {} }), /JSON inválido/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RN-16: saveConfig grava só o hash e não persiste campos calculados', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-config-'));
  const file = path.join(dir, 'config.json');
  saveConfig(file, { ...normalize({ tokenHash: 'scrypt$aa$bb' }) });
  const saved = readRawConfig(file);
  assert.equal(saved.tokenHash, 'scrypt$aa$bb');
  assert.equal('exposed' in saved, false);
  assert.equal('token' in saved, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RNF-08: pm2Entry é opcional (vazio por padrão) e precisa ser um texto curto', () => {
  assert.equal(normalize({}).pm2Entry, '');
  const entry = path.join('C:', 'npm', 'node_modules', 'pm2', 'bin', 'pm2');
  assert.equal(normalize({ pm2Entry: entry }).pm2Entry, entry);
  assert.throws(() => normalize({ pm2Entry: 5 }), /pm2Entry/);
  assert.throws(() => normalize({ pm2Entry: 'x'.repeat(261) }), /pm2Entry/);
});
