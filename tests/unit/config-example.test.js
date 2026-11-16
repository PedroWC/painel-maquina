'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const examplePath = path.join(__dirname, '..', '..', 'config.example.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

test('RN-10: o exemplo de configuração escuta apenas em loopback', () => {
  assert.equal(example.host, '127.0.0.1');
  assert.deepEqual(example.allowedHosts, []);
});

test('RN-16: o exemplo de configuração não traz token nem hash', () => {
  assert.equal(example.tokenHash, '');
  assert.equal('token' in example, false);
});

test('RN-02 e RN-15: o exemplo traz os limites padrão documentados', () => {
  assert.equal(example.sessionHours, 12);
  assert.equal(example.maxTerminals, 20);
});

test('RNF-09: config.json real nunca é versionado', () => {
  const ignore = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
  assert.match(ignore, /^config\.json$/m);
  assert.match(ignore, /^audit\.log$/m);
});
