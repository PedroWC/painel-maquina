'use strict';

// Teste de sistema (windows), SOMENTE LEITURA: usa o Docker real desta máquina
// sem criar, alterar nem remover nada. Se o Docker não estiver instalado, é ignorado;
// se o motor estiver parado, confere a mensagem amigável.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli } = require('../../src/cli');
const { createDockerProvider } = require('../../src/providers/docker');

const isWindows = process.platform === 'win32';
const provider = createDockerProvider({ cli: createCli({ timeoutMs: 30000 }) });

test('RF-15 e UC-10: detecção e listagem reais, com mensagem amigável se o motor estiver parado', { skip: !isWindows, timeout: 90000 }, async (t) => {
  const detected = await provider.detect();
  if (!detected.disponivel) return t.skip('Docker não está instalado nesta máquina');

  assert.match(detected.versao, /^\d+\.\d+/);
  assert.equal(typeof detected.info.motor, 'boolean');

  if (!detected.info.motor) {
    await assert.rejects(provider.list(), (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /motor não está respondendo/);
      assert.equal(err.message.includes('npipe'), false);
      return true;
    });
    return undefined;
  }

  const { sections } = await provider.list();
  assert.deepEqual(sections.map((s) => s.id), ['containers', 'imagens']);
  for (const section of sections) assert.ok(Array.isArray(section.rows));
  return undefined;
});
