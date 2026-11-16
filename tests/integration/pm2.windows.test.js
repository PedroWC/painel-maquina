'use strict';

// Teste de sistema (windows): usa o pm2 real, se existir nesta máquina, com um PM2_HOME ISOLADO
// em uma pasta temporária (nunca toca nos seus processos do pm2) e um processo descartável
// PainelTeste_app. Ao final encerra o daemon isolado e apaga a pasta. Sem pm2, é ignorado.
// Para testar com um pm2 fora do PATH: defina PAINEL_PM2_ENTRY com o caminho de node_modules\pm2\bin\pm2.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCli } = require('../../src/cli');
const { createPm2Provider, createPm2Locator } = require('../../src/providers/pm2');

const isWindows = process.platform === 'win32';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('RF-19: ciclo completo com o pm2 real em um PM2_HOME isolado', { skip: !isWindows, timeout: 180000 }, async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-pm2-'));
  process.env.PM2_HOME = home; // este arquivo de teste roda em processo próprio
  const cli = createCli({ timeoutMs: 60000 });
  const locate = createPm2Locator({ cli });
  const entry = await locate();
  if (!entry) {
    fs.rmSync(home, { recursive: true, force: true });
    return t.skip('pm2 não está instalado nesta máquina');
  }

  const provider = createPm2Provider({ cli, locate, isProtectedPid: () => false });
  const script = path.join(home, 'app.js');
  fs.writeFileSync(script, "setInterval(() => console.log('tick-painel-teste'), 300);\n");
  const pm2 = (...args) => cli.run(process.execPath, [entry, ...args]);

  try {
    const detected = await provider.detect();
    assert.equal(detected.disponivel, true);
    assert.match(detected.versao, /^\d+\.\d+/);
    assert.equal(detected.info.daemon, false, 'detectar não deve iniciar o daemon');

    // Sem daemon: lista vazia com aviso, sem iniciar nada.
    const empty = await provider.list();
    assert.match(empty.contexto, /daemon do pm2 não está em execução/);
    assert.equal(fs.existsSync(path.join(home, 'pm2.pid')), false, 'listar sem daemon não deve criar o daemon');

    await pm2('start', script, '--name', 'PainelTeste_app');
    const find = async () => (await provider.list()).sections[0].rows.find((r) => r.cells.nome === 'PainelTeste_app');

    let row = await find();
    assert.ok(row, 'o processo criado deveria aparecer');
    assert.equal(row.status.texto, 'Online');
    assert.deepEqual(row.actions, ['restart', 'stop', 'delete']);
    assert.match(String(row.cells.pid), /^\d+$/);

    await provider.actions.restart.run(row.id);
    await wait(1500);
    row = await find();
    assert.equal(row.cells.restarts, 1, 'reiniciar incrementa o contador');

    await wait(800);
    assert.match(await provider.logs(row.id), /tick-painel-teste/);

    await provider.actions.stop.run(row.id);
    await wait(1000);
    row = await find();
    assert.equal(row.status.texto, 'Parado');
    assert.deepEqual(row.actions, ['start', 'delete']);

    await provider.actions.start.run(row.id);
    await wait(1500);
    assert.equal((await find()).status.texto, 'Online');

    await provider.actions.delete.run(row.id);
    await wait(500);
    assert.equal(await find(), undefined);
  } finally {
    await pm2('kill').catch(() => {});
    await wait(500);
    fs.rmSync(home, { recursive: true, force: true });
  }
  return undefined;
});
