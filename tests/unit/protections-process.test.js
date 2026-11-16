'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isCriticalProcess, CRITICAL_PROCESSES } = require('../../src/protections');

test('RN-20: os processos sem os quais o Windows cai são críticos, sem diferenciar maiúsculas', () => {
  for (const name of ['csrss', 'CSRSS', 'wininit', 'winlogon', 'lsass', 'smss', 'services', 'System', 'Registry', 'svchost', 'Memory Compression', 'Secure System', 'lsm']) {
    assert.equal(isCriticalProcess(name), true, name);
  }
});

test('RN-20: programas comuns e nomes parecidos não são críticos', () => {
  for (const name of ['chrome', 'node', 'explorer', 'dwm', 'svchost2', 'mycsrss', 'lsass-helper', '', null, undefined]) {
    assert.equal(isCriticalProcess(name), false, String(name));
  }
});

test('RN-20: a lista está em minúsculas e sem duplicatas, como o Get-Process compara', () => {
  assert.equal(new Set(CRITICAL_PROCESSES).size, CRITICAL_PROCESSES.length);
  for (const name of CRITICAL_PROCESSES) assert.equal(name, name.toLowerCase());
  assert.equal(CRITICAL_PROCESSES.some((n) => n.endsWith('.exe')), false);
});
