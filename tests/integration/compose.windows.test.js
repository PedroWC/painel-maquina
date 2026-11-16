'use strict';

// Teste de sistema (windows), SOMENTE LEITURA: usa o plugin `docker compose` real, se existir.
// Sem o plugin é ignorado; com o motor do Docker parado, confere a mensagem amigável.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli } = require('../../src/cli');
const { createComposeProvider } = require('../../src/providers/compose');

const isWindows = process.platform === 'win32';
const cli = createCli({ timeoutMs: 30000 });
const provider = createComposeProvider({ cli });

test('RF-18 e UC-10: detecção e listagem reais do Compose, sem alterar nada', { skip: !isWindows, timeout: 90000 }, async (t) => {
  const detected = await provider.detect();
  if (!detected.disponivel) return t.skip('o plugin docker compose não está instalado nesta máquina');
  assert.match(detected.versao, /^\d+\.\d+/);

  try {
    const { sections } = await provider.list();
    assert.deepEqual(sections.map((s) => s.id), ['projetos', 'servicos']);
  } catch (err) {
    assert.equal(err.status, 503, 'sem o motor do Docker, deve ser a mensagem amigável');
    assert.match(err.message, /motor não está respondendo/);
  }
  return undefined;
});
