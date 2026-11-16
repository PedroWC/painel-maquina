'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, str, optionalStr, oneOf, int } = require('../../src/validate');

const rejects400 = (fn) => assert.throws(fn, (err) => err instanceof HttpError && err.status === 400);

test('RN-17: str aceita texto dentro dos limites', () => {
  assert.equal(str('MinhaTarefa', { field: 'nome' }), 'MinhaTarefa');
});

test('RN-17: str recusa tipos que não são texto', () => {
  for (const value of [undefined, null, 5, {}, [], true]) rejects400(() => str(value));
});

test('RN-17: str recusa vazio, excesso de tamanho e caracteres de controle', () => {
  rejects400(() => str(''));
  rejects400(() => str('a'.repeat(300)));
  rejects400(() => str('a'.repeat(11), { max: 10 }));
  rejects400(() => str('linha1\nlinha2'));
  rejects400(() => str('nulo\u0000byte'));
  rejects400(() => str('tab\there'));
});

test('RN-17: str respeita o padrão informado', () => {
  assert.equal(str('abc-123', { pattern: /^[a-z0-9-]+$/ }), 'abc-123');
  rejects400(() => str('abc 123', { pattern: /^[a-z0-9-]+$/ }));
});

test('RN-17: optionalStr aceita ausência e valida o que vier', () => {
  assert.equal(optionalStr(undefined), '');
  assert.equal(optionalStr(null), '');
  assert.equal(optionalStr(''), '');
  assert.equal(optionalStr('ok'), 'ok');
  rejects400(() => optionalStr('a\nb'));
  rejects400(() => optionalStr(7));
});

test('RN-17: oneOf só aceita valores da allowlist', () => {
  assert.equal(oneOf('stop', ['start', 'stop']), 'stop');
  rejects400(() => oneOf('format', ['start', 'stop']));
  rejects400(() => oneOf(undefined, ['start', 'stop']));
});

test('RN-17: int aceita inteiros no intervalo e recusa o resto', () => {
  assert.equal(int(5, { min: 1, max: 10 }), 5);
  rejects400(() => int(0, { min: 1, max: 10 }));
  rejects400(() => int(11, { min: 1, max: 10 }));
  rejects400(() => int(1.5, { min: 1, max: 10 }));
  rejects400(() => int('5', { min: 1, max: 10 }));
});
