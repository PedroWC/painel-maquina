'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { defineProvider, safeId } = require('../../../src/providers/base');
const { HttpError } = require('../../../src/validate');

const valid = () => ({
  id: 'exemplo',
  nome: 'Exemplo',
  detect: async () => ({ disponivel: true }),
  list: async () => ({ sections: [] }),
  actions: { restart: { rotulo: 'Reiniciar', destrutiva: false, run: async () => {} } },
});

test('RN-12: um provedor válido é criado, congelado e recebe validateId padrão', () => {
  const provider = defineProvider(valid());
  assert.equal(provider.id, 'exemplo');
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(typeof provider.validateId, 'function');
});

test('RN-12: o provedor pode trazer o próprio validateId', () => {
  const provider = defineProvider({ ...valid(), validateId: (id) => id.toUpperCase() });
  assert.equal(provider.validateId('a'), 'A');
});

test('RNF-10: contrato incompleto ou inválido é recusado ao definir o provedor', () => {
  const cases = [
    { id: 'Inválido' },
    { id: 'x'.repeat(21) },
    { id: '' },
    { nome: '' },
    { nome: undefined },
    { detect: undefined },
    { list: 'não é função' },
    { actions: undefined },
    { actions: null },
    { actions: { op: { rotulo: 'x', destrutiva: 'sim', run: () => {} } } },
    { actions: { op: { rotulo: 5, destrutiva: false, run: () => {} } } },
    { actions: { op: { rotulo: 'x', destrutiva: false } } },
  ];
  for (const override of cases) {
    assert.throws(() => defineProvider({ ...valid(), ...override }), Error, JSON.stringify(override));
  }
});

test('RN-12: identificadores seguros são aceitos', () => {
  for (const id of ['abc123', 'a1b2c3d4e5f6', 'meu-container_1.2', 'nginx:stable', 'registry/ns/img:tag', 'sha256:abc', 'img@sha256']) {
    assert.equal(safeId(id), id);
  }
});

test('RN-12: identificadores que virariam opções ou injeção são recusados', () => {
  const bad = ['-f', '--all', '-rf', '', ' ', 'a b', 'a;b', 'a&&b', 'a|b', '$(x)', '`x`', 'a\nb', 'a\\b', '../x', undefined, null, 5, {}, 'x'.repeat(257)];
  for (const id of bad) {
    assert.throws(() => safeId(id), (e) => e instanceof HttpError && e.status === 400, JSON.stringify(id));
  }
});
