'use strict';

// Teste de sistema (windows), SOMENTE LEITURA: usa o wsl.exe real para detectar a versão e listar
// as distribuições. NUNCA encerra distribuições nem desliga o WSL. Sem WSL, é ignorado.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli } = require('../../src/cli');
const { createWslProvider } = require('../../src/providers/wsl');
const { DISTRO_NAME } = require('../../src/validate');

const isWindows = process.platform === 'win32';
const provider = createWslProvider({ cli: createCli({ timeoutMs: 30000 }) });

test('RF-22: detecção e listagem reais decodificam o UTF-16 do wsl.exe corretamente', { skip: !isWindows, timeout: 90000 }, async (t) => {
  const detected = await provider.detect();
  if (!detected.disponivel) return t.skip('WSL não está instalado nesta máquina');
  assert.match(detected.versao, /^\d+\.\d+|legado/);

  const result = await provider.list();
  const distros = result.sections[0].rows;
  for (const row of distros) {
    assert.match(row.id, DISTRO_NAME, `nome inválido ou mal decodificado: ${JSON.stringify(row.id)}`);
    assert.equal(row.id.includes('\0'), false);
    assert.match(row.cells.versao, /^WSL [12]$/);
    assert.ok(['ok', 'off'].includes(row.status.tom));
    assert.deepEqual(row.terminal, { shell: 'wsl', distro: row.id });
  }
  if (distros.length > 0) {
    assert.equal(result.sections[1].id, 'geral');
    assert.equal(result.sections[1].rows[0].nomeConfirmacao, 'wsl');
  }
  return undefined;
});
