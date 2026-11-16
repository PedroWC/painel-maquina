'use strict';

// Teste de sistema (windows), SOMENTE LEITURA: usa o kubectl real desta máquina para detectar a
// versão e listar contextos. Não altera o kubeconfig nem nenhum cluster. Sem kubectl, é ignorado;
// sem cluster acessível, confere o aviso amigável em vez de um erro técnico.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli } = require('../../src/cli');
const { createKubernetesProvider } = require('../../src/providers/kubernetes');

const isWindows = process.platform === 'win32';
const provider = createKubernetesProvider({ cli: createCli({ timeoutMs: 30000 }) });

test('RF-20 e RN-13: detecção e listagem reais, sem alterar nada', { skip: !isWindows, timeout: 120000 }, async (t) => {
  const detected = await provider.detect();
  if (!detected.disponivel) return t.skip('kubectl não está instalado nesta máquina');
  assert.match(detected.versao, /^\d+\.\d+/);

  const result = await provider.list();
  if (result.controles.length === 0) {
    assert.match(result.aviso, /Nenhum contexto/);
    return undefined;
  }
  assert.match(result.contexto, /^Contexto: .+ · Namespace: .+$/, 'o contexto e o namespace precisam estar sempre visíveis');
  assert.deepEqual(result.controles.map((c) => c.id), ['context', 'namespace']);
  if (result.aviso) {
    assert.equal(result.aviso.includes('dial tcp'), false, 'sem o erro técnico bruto');
    assert.deepEqual(result.sections, []);
  } else {
    assert.deepEqual(result.sections.map((s) => s.id), ['deployments', 'pods', 'services']);
  }
  return undefined;
});
