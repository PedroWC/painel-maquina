'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SELF_TASK,
  assertTaskAllowed,
  assertServiceAllowed,
  assertProcessAllowed,
  isCriticalService,
} = require('../../src/protections');
const { HttpError } = require('../../src/validate');

const blocked = (fn) => assert.throws(fn, (err) => err instanceof HttpError && err.status === 409);

test('RN-03: a tarefa do painel não pode ser parada, desativada, editada nem excluída', () => {
  for (const op of ['stop', 'disable', 'delete', 'edit']) {
    blocked(() => assertTaskAllowed(SELF_TASK, op));
  }
});

test('RN-03: a proteção da tarefa do painel ignora maiúsculas e minúsculas', () => {
  blocked(() => assertTaskAllowed('painelmaquina', 'delete'));
  blocked(() => assertTaskAllowed('PAINELMAQUINA', 'stop'));
});

test('RN-03: outras tarefas e operações inofensivas continuam permitidas', () => {
  assert.doesNotThrow(() => assertTaskAllowed('MinhaTarefa', 'delete'));
  assert.doesNotThrow(() => assertTaskAllowed(SELF_TASK, 'run'));
  assert.doesNotThrow(() => assertTaskAllowed(SELF_TASK, 'enable'));
});

test('RN-09: serviços críticos só podem ser iniciados', () => {
  for (const op of ['stop', 'restart', 'auto', 'manual', 'disabled', 'edit', 'delete']) {
    blocked(() => assertServiceAllowed('EventLog', op));
    blocked(() => assertServiceAllowed('Schedule', op));
  }
  assert.doesNotThrow(() => assertServiceAllowed('EventLog', 'start'));
});

test('RN-09: a lista de serviços críticos ignora maiúsculas e minúsculas', () => {
  assert.equal(isCriticalService('rpcss'), true);
  assert.equal(isCriticalService('RPCSS'), true);
  blocked(() => assertServiceAllowed('winmgmt', 'stop'));
});

test('RN-09: serviços comuns, inclusive o sshd, não são bloqueados pelo servidor', () => {
  assert.equal(isCriticalService('meu-servico'), false);
  assert.doesNotThrow(() => assertServiceAllowed('meu-servico', 'stop'));
  assert.doesNotThrow(() => assertServiceAllowed('sshd', 'restart'));
});

test('RN-04: processos do painel e dos terminais não podem ser encerrados', () => {
  const protectedPids = new Set([100, 200]);
  blocked(() => assertProcessAllowed(100, protectedPids));
  blocked(() => assertProcessAllowed(200, protectedPids));
  assert.doesNotThrow(() => assertProcessAllowed(300, protectedPids));
});
