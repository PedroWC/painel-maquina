'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry, withTimeout } = require('../../../src/providers/registry');

function fake(id, detect) {
  return { id, nome: id.toUpperCase(), detect };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('RF-23: detecta provedores disponíveis e ausentes e informa versão e extras', async () => {
  const registry = createRegistry({
    providers: [
      fake('docker', async () => ({ disponivel: true, versao: '29.9.3', info: { motor: false } })),
      fake('pm2', async () => ({ disponivel: false })),
    ],
    now: () => 1700000000000,
  });
  const list = await registry.refresh();
  assert.deepEqual(list[0], {
    id: 'docker',
    nome: 'DOCKER',
    disponivel: true,
    versao: '29.9.3',
    info: { motor: false },
    erro: null,
    verificadoEm: 1700000000000,
  });
  assert.equal(list[1].disponivel, false);
  assert.equal(list[1].versao, '');
});

test('RN-11: provedor ausente, desconhecido ou ainda não detectado não é entregue', async () => {
  const docker = fake('docker', async () => ({ disponivel: true }));
  const registry = createRegistry({ providers: [docker, fake('pm2', async () => ({ disponivel: false }))] });
  assert.equal(registry.get('docker'), null, 'antes da detecção não existe');
  await registry.refresh();
  assert.equal(registry.get('docker'), docker);
  assert.equal(registry.get('pm2'), null);
  assert.equal(registry.get('inexistente'), null);
});

test('RN-14: a falha de um provedor na detecção não afeta os demais', async () => {
  const registry = createRegistry({
    providers: [
      fake('quebrado', async () => {
        throw new Error('explodiu '.repeat(100));
      }),
      fake('docker', async () => ({ disponivel: true, versao: '1' })),
    ],
  });
  const list = await registry.refresh();
  assert.equal(list[0].disponivel, false);
  assert.ok(list[0].erro.length <= 200);
  assert.equal(list[1].disponivel, true);
  assert.equal(registry.get('quebrado'), null);
  assert.ok(registry.get('docker'));
});

test('RN-14: detecção que demora demais é encerrada e marcada com erro', async () => {
  const registry = createRegistry({
    providers: [fake('lento', () => new Promise(() => {})), fake('docker', async () => ({ disponivel: true }))],
    detectTimeoutMs: 30,
  });
  const list = await registry.refresh();
  assert.equal(list[0].disponivel, false);
  assert.match(list[0].erro, /Tempo esgotado/);
  assert.equal(list[1].disponivel, true);
});

test('RF-23: instalar a ferramenta depois faz o provedor aparecer na próxima detecção, sem reiniciar', async () => {
  const state = { installed: false };
  const pm2 = fake('pm2', async () => ({ disponivel: state.installed, versao: state.installed ? '5.4.0' : '' }));
  const registry = createRegistry({ providers: [pm2] });
  await registry.refresh();
  assert.equal(registry.get('pm2'), null);
  state.installed = true;
  assert.equal(registry.get('pm2'), null, 'sem nova detecção, nada muda');
  await registry.refresh();
  assert.equal(registry.get('pm2'), pm2);
  assert.equal(registry.list()[0].versao, '5.4.0');
  state.installed = false;
  await registry.refresh();
  assert.equal(registry.get('pm2'), null, 'desinstalar também é percebido');
});

test('RF-23: a detecção periódica roda ao iniciar e se repete até parar', async () => {
  let calls = 0;
  const registry = createRegistry({
    providers: [fake('docker', async () => ({ disponivel: ++calls > 0 }))],
    intervalMs: 20,
  });
  registry.start();
  await wait(90);
  registry.stop();
  const seen = calls;
  assert.ok(seen >= 3, `esperava várias detecções, houve ${seen}`);
  await wait(60);
  assert.equal(calls, seen, 'depois de parar não detecta mais');
});

test('RF-23: a listagem sem detecção mostra o provedor como indisponível', () => {
  const registry = createRegistry({ providers: [fake('docker', async () => ({ disponivel: true }))] });
  assert.deepEqual(registry.list()[0], {
    id: 'docker',
    nome: 'DOCKER',
    disponivel: false,
    versao: '',
    info: null,
    erro: null,
    verificadoEm: null,
  });
});

test('RN-14: withTimeout devolve o resultado, propaga erros e limpa o temporizador', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'x'), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('falhou')), 1000, 'x'), /falhou/);
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'demorou'), /demorou/);
});
