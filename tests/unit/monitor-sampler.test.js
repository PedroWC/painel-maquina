'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSampler, SCRIPT } = require('../../src/monitor-sampler');

// Processo filho simulado: guarda o que recebe pela entrada e deixa o teste escrever a saída.
function createFakeSpawn() {
  const children = [];
  function spawn(file, args, options) {
    const child = new EventEmitter();
    child.file = file;
    child.args = args;
    child.options = options;
    child.written = [];
    child.killed = false;
    child.stdinEnded = false;
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stdin = new EventEmitter();
    child.stdin.write = (text) => child.written.push(text);
    child.stdin.end = () => {
      child.stdinEnded = true;
    };
    child.kill = () => {
      child.killed = true;
    };
    child.reply = (text) => child.stdout.emit('data', text);
    children.push(child);
    return child;
  }
  return { spawn, children };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('RF-28: pede uma leitura com "snap" e devolve o JSON da resposta, ignorando ruído e linhas parciais', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn, executable: 'powershell.exe' });
  const pending = sampler.sample();
  const child = fake.children[0];
  assert.deepEqual(child.written, ['snap\n']);
  child.reply('AVISO solto do PowerShell\n');
  child.reply('{"ok":true,"t":12');
  child.reply('34,"procs":[]}\n');
  assert.deepEqual(await pending, { ok: true, t: 1234, procs: [] });
  assert.equal(sampler.isRunning(), true);
  // o mesmo processo atende a leitura seguinte
  const second = sampler.sample();
  assert.equal(fake.children.length, 1);
  assert.equal(child.written.length, 2);
  child.reply('{"ok":true,"t":1}\n');
  assert.equal((await second).t, 1);
});

test('RN-17: o amostrador usa script estático codificado, sem entrada do cliente e sem janela', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn, executable: 'powershell.exe', env: { A: '1' } });
  const pending = sampler.sample();
  const child = fake.children[0];
  assert.equal(child.file, 'powershell.exe');
  assert.equal(child.options.windowsHide, true);
  assert.equal(child.options.env.PP_PARAMS, '{}');
  assert.equal(child.options.env.A, '1');
  assert.ok(child.args.includes('-NonInteractive'));
  const encoded = child.args[child.args.indexOf('-EncodedCommand') + 1];
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.ok(script.includes('GPU Engine'));
  assert.ok(script.includes('GetProcesses'));
  assert.equal(SCRIPT.includes('${'), false);
  assert.equal(/Invoke-Expression|iex\s/i.test(SCRIPT), false);
  child.reply('{"ok":true}\n');
  await pending;
});

test('RF-28: erro informado pelo script, JSON inválido e resposta enorme viram rejeição', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn });
  const first = sampler.sample();
  fake.children[0].reply('{"ok":false,"error":"sem permissão"}\n');
  await assert.rejects(first, /sem permissão/);

  const second = sampler.sample();
  fake.children[0].reply('{isto não é json}\n');
  await assert.rejects(second, /inválida/);

  const third = sampler.sample();
  fake.children[0].reply('x'.repeat(9 * 1024 * 1024));
  await assert.rejects(third, /grande demais/);
  assert.equal(fake.children[0].killed, true);
  assert.equal(sampler.isRunning(), false);
});

test('RNF-12: tempo esgotado encerra o processo e a próxima leitura sobe outro', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn, firstTimeoutMs: 20, timeoutMs: 20 });
  await assert.rejects(sampler.sample(), /Tempo esgotado/);
  assert.equal(fake.children[0].killed, true);
  assert.equal(sampler.isRunning(), false);
  const again = sampler.sample();
  assert.equal(fake.children.length, 2);
  fake.children[1].reply('{"ok":true,"t":5}\n');
  assert.equal((await again).t, 5);
});

test('RF-28: se o processo do amostrador morrer, a leitura em andamento falha e a seguinte reinicia', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn });
  const pending = sampler.sample();
  fake.children[0].emit('exit', 1);
  await assert.rejects(pending, /encerrou/);
  assert.equal(sampler.isRunning(), false);
  const next = sampler.sample();
  assert.equal(fake.children.length, 2);
  fake.children[1].reply('{"ok":true}\n');
  await next;
});

test('RF-28: erro ao iniciar o processo rejeita a leitura', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn });
  const pending = sampler.sample();
  fake.children[0].emit('error', new Error('não achou o powershell'));
  await assert.rejects(pending, /não achou/);
  assert.equal(sampler.isRunning(), false);
});

test('RF-28: duas leituras ao mesmo tempo são recusadas', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn });
  const first = sampler.sample();
  await assert.rejects(sampler.sample(), /em andamento/);
  fake.children[0].reply('{"ok":true}\n');
  await first;
});

test('RNF-12: stop encerra a entrada e o processo, e rejeita a leitura pendente', async () => {
  const fake = createFakeSpawn();
  const sampler = createSampler({ spawn: fake.spawn });
  const pending = sampler.sample();
  await flush();
  sampler.stop();
  await assert.rejects(pending, /parado/);
  assert.equal(fake.children[0].stdinEnded, true);
  assert.equal(fake.children[0].killed, true);
  assert.equal(sampler.isRunning(), false);
  sampler.stop(); // parar de novo não faz mal
});
