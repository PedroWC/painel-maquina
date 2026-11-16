'use strict';

// Teste de sistema (windows), SOMENTE LEITURA: usa o Podman real, se existir, sem criar, alterar nem
// remover nada. Sem Podman é ignorado; com a máquina parada, confere a mensagem amigável.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli } = require('../../src/cli');
const { createPodmanProvider } = require('../../src/providers/podman');

const isWindows = process.platform === 'win32';
const provider = createPodmanProvider({ cli: createCli({ timeoutMs: 30000 }) });

test('RF-21 e UC-10: detecção e listagem reais, com mensagem amigável se a máquina estiver parada', { skip: !isWindows, timeout: 90000 }, async (t) => {
  const detected = await provider.detect();
  if (!detected.disponivel) return t.skip('Podman não está instalado nesta máquina');
  assert.match(detected.versao, /^\d+\.\d+/);
  assert.equal(typeof detected.info.motor, 'boolean');

  if (!detected.info.motor) {
    await assert.rejects(provider.list(), (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /podman machine start/);
      return true;
    });
    return undefined;
  }
  const { sections } = await provider.list();
  assert.deepEqual(sections.map((s) => s.id), ['containers', 'imagens']);
  return undefined;
});
