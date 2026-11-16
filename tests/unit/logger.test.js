'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installFileLogger, rotate } = require('../../src/logger');

function fakeConsole() {
  const seen = [];
  const target = {};
  for (const level of ['log', 'info', 'warn', 'error']) target[level] = (...args) => seen.push([level, ...args]);
  return { target, seen };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'painel-log-'));
}

test('RNF-03: o console passa a ser espelhado no arquivo com data e nível, sem perder a saída original', () => {
  const dir = tempDir();
  const file = path.join(dir, 'painel.log');
  const { target, seen } = fakeConsole();
  const restore = installFileLogger({ file, target, now: () => new Date('2026-02-03T04:05:06.000Z') });
  target.log('Painel em http://127.0.0.1:8780');
  target.warn('aviso', { a: 1 });
  target.error('falha %s', 'x');
  restore();
  assert.deepEqual(fs.readFileSync(file, 'utf8').trim().split('\n'), [
    '2026-02-03T04:05:06.000Z [log] Painel em http://127.0.0.1:8780',
    '2026-02-03T04:05:06.000Z [warn] aviso { a: 1 }',
    '2026-02-03T04:05:06.000Z [error] falha x',
  ]);
  assert.deepEqual(seen.map((s) => s[0]), ['log', 'warn', 'error']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RNF-03: restaurar devolve o console ao comportamento original', () => {
  const dir = tempDir();
  const file = path.join(dir, 'painel.log');
  const { target } = fakeConsole();
  const originalLog = target.log;
  const restore = installFileLogger({ file, target });
  assert.notEqual(target.log, originalLog);
  restore();
  assert.equal(target.log, originalLog);
  target.log('depois de restaurar');
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RNF-03: o log passa por rotação ao ultrapassar o limite e mantém um backup', () => {
  const dir = tempDir();
  const file = path.join(dir, 'painel.log');
  fs.writeFileSync(file, 'x'.repeat(100));
  rotate(file, 1000);
  assert.equal(fs.existsSync(`${file}.1`), false, 'abaixo do limite não rotaciona');
  rotate(file, 50);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(`${file}.1`, 'utf8'), 'x'.repeat(100));

  fs.writeFileSync(file, 'y'.repeat(100));
  const { target } = fakeConsole();
  installFileLogger({ file, target, maxBytes: 50 })();
  assert.equal(fs.readFileSync(`${file}.1`, 'utf8'), 'y'.repeat(100), 'o backup anterior é substituído');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RNF-03: falha ao gravar o log nunca derruba o painel nem esconde a mensagem', () => {
  const { target, seen } = fakeConsole();
  const restore = installFileLogger({ file: path.join(os.tmpdir(), 'painel-inexistente-xyz', 'a', 'painel.log'), target });
  assert.doesNotThrow(() => target.error('mensagem importante'));
  assert.deepEqual(seen, [['error', 'mensagem importante']]);
  restore();
});

test('RNF-03: rotação em arquivo inexistente ou inacessível não lança erro', () => {
  assert.doesNotThrow(() => rotate(path.join(os.tmpdir(), 'painel-nao-existe-xyz.log'), 10));
});
