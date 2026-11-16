'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAudit, sanitize } = require('../../src/audit');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-audit-'));
  return { dir, file: path.join(dir, 'audit.log') };
}

test('RN-06: cada ação vira uma linha JSON com data, ação e resultado', () => {
  const { dir, file } = tempFile();
  const audit = createAudit({ file, now: () => new Date('2026-01-02T03:04:05.000Z') });
  audit.record({ ip: '127.0.0.1', action: 'login', result: 'ok' });
  audit.record({ ip: '127.0.0.1', action: 'tarefa.excluir', target: 'MinhaTarefa', result: 'ok' });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], { ts: '2026-01-02T03:04:05.000Z', ip: '127.0.0.1', action: 'login', result: 'ok' });
  assert.equal(lines[1].target, 'MinhaTarefa');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RNF-07: chaves sensíveis nunca são gravadas', () => {
  const clean = sanitize({
    action: 'login',
    token: 'segredo',
    detail: { cookie: 'sid=abc', tokenHash: 'h', Authorization: 'Bearer x', input: 'ls -la', ok: 1 },
  });
  assert.equal(clean.token, '[omitido]');
  assert.equal(clean.detail.cookie, '[omitido]');
  assert.equal(clean.detail.tokenHash, '[omitido]');
  assert.equal(clean.detail.Authorization, '[omitido]');
  assert.equal(clean.detail.input, '[omitido]');
  assert.equal(clean.detail.ok, 1);
  assert.equal(clean.action, 'login');
});

test('RNF-07: o arquivo de auditoria não contém o valor de campos sensíveis', () => {
  const { dir, file } = tempFile();
  const audit = createAudit({ file });
  audit.record({ action: 'login', result: 'falha', token: 'valor-secreto-123', detail: { sid: 'cookie-secreto' } });
  const content = fs.readFileSync(file, 'utf8');
  assert.equal(content.includes('valor-secreto-123'), false);
  assert.equal(content.includes('cookie-secreto'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RNF-07: falha ao gravar não derruba o painel', () => {
  const audit = createAudit({ file: path.join(os.tmpdir(), 'painel-inexistente-xyz', 'a', 'audit.log') });
  const original = console.error;
  console.error = () => {};
  try {
    assert.doesNotThrow(() => audit.record({ action: 'teste', result: 'ok' }));
  } finally {
    console.error = original;
  }
});
