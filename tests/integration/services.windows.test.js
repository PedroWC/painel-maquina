'use strict';

// Teste de sistema (windows): serviços reais. A parte de escrita só roda com
// privilégio de administrador e usa apenas o serviço PainelTeste_svc, removido ao final.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPowerShell } = require('../../src/powershell');
const { detectAdmin } = require('../../src/system');
const { SERVICE_LIST, SERVICE_ACTION, SERVICE_CREATE, SERVICE_EDIT } = require('../../src/ps-scripts');

const NAME = 'PainelTeste_svc';
const ps = createPowerShell();
const isWindows = process.platform === 'win32';

const list = async () => (await ps.runJson(SERVICE_LIST, {})) || [];

async function cleanup() {
  if ((await list()).some((s) => s.name === NAME)) {
    await ps.run(SERVICE_ACTION, { name: NAME, op: 'delete' });
  }
}

test('RF-11: lista serviços reais com os campos esperados', { skip: !isWindows, timeout: 60000 }, async () => {
  const services = await list();
  assert.ok(services.length > 10);
  const sample = services.find((s) => s.name === 'Winmgmt') || services[0];
  for (const key of ['name', 'display', 'state', 'start', 'user', 'path']) assert.ok(key in sample, key);
});

test('RN-17: um nome com curinga nunca atinge serviços reais', { skip: !isWindows, timeout: 60000 }, async () => {
  for (const op of ['start', 'stop']) {
    await assert.rejects(ps.run(SERVICE_ACTION, { name: '*', op }), /SERVICO_NAO_EXISTE/);
    await assert.rejects(ps.run(SERVICE_ACTION, { name: 'Win*', op }), /SERVICO_NAO_EXISTE/);
  }
});

test(
  'RF-12 a RF-14: cria, edita, altera a inicialização e exclui um serviço real',
  { skip: !isWindows || !detectAdmin(), timeout: 120000 },
  async () => {
    await cleanup();
    try {
      await ps.run(SERVICE_CREATE, {
        name: NAME,
        path: 'C:\\Windows\\System32\\cmd.exe /c exit 0',
        display: 'Painel Teste',
        desc: 'Serviço temporário de teste',
        start: 'Manual',
      });
      let svc = (await list()).find((s) => s.name === NAME);
      assert.ok(svc, 'o serviço criado deveria aparecer');
      assert.equal(svc.display, 'Painel Teste');
      assert.equal(svc.start, 'Manual');
      assert.equal(svc.desc, 'Serviço temporário de teste');

      await assert.rejects(
        ps.run(SERVICE_CREATE, { name: NAME, path: 'C:\\x.exe', display: '', desc: '', start: 'Manual' }),
        /SERVICO_EXISTE/,
      );

      await ps.run(SERVICE_EDIT, { name: NAME, path: '', display: 'Painel Teste 2', desc: null, start: 'Disabled' });
      svc = (await list()).find((s) => s.name === NAME);
      assert.equal(svc.display, 'Painel Teste 2');
      assert.equal(svc.start, 'Disabled');
      assert.equal(svc.desc, 'Serviço temporário de teste');

      await ps.run(SERVICE_ACTION, { name: NAME, op: 'manual' });
      assert.equal((await list()).find((s) => s.name === NAME).start, 'Manual');
      await ps.run(SERVICE_ACTION, { name: NAME, op: 'auto' });
      assert.equal((await list()).find((s) => s.name === NAME).start, 'Auto');

      await ps.run(SERVICE_ACTION, { name: NAME, op: 'delete' });
      assert.equal((await list()).some((s) => s.name === NAME), false);
      await assert.rejects(ps.run(SERVICE_ACTION, { name: NAME, op: 'start' }), /SERVICO_NAO_EXISTE/);
    } finally {
      await cleanup();
    }
  },
);
