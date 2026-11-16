'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGpuInfo, parseNvidia } = require('../../src/gpu-info');
const { HttpError } = require('../../src/validate');

test('RF-28: lê nome, uso, memória e temperatura da saída do nvidia-smi', () => {
  assert.deepEqual(parseNvidia('NVIDIA GeForce GTX 1080, 5, 1102, 8192, 41\n'), {
    name: 'NVIDIA GeForce GTX 1080',
    percent: 5,
    memUsedMb: 1102,
    memTotalMb: 8192,
    temperatureC: 41,
  });
});

test('RF-28: com várias GPUs soma a memória, usa o maior uso e a maior temperatura', () => {
  const info = parseNvidia('GPU A, 10, 100, 1000, 40\r\nGPU B, 60, 200, 2000, 70\r\n');
  assert.equal(info.name, 'GPU A + GPU B');
  assert.equal(info.percent, 60);
  assert.equal(info.memUsedMb, 300);
  assert.equal(info.memTotalMb, 3000);
  assert.equal(info.temperatureC, 70);
});

test('RF-28: valores [N/A] e saída vazia ou torta não quebram', () => {
  const info = parseNvidia('GPU X, [N/A], [N/A], [N/A], [N/A]');
  assert.equal(info.percent, 0);
  assert.equal(info.memTotalMb, null);
  assert.equal(info.temperatureC, null);
  assert.equal(parseNvidia(''), null);
  assert.equal(parseNvidia('lixo sem virgulas'), null);
});

test('RN-12: chama o nvidia-smi fixo, sem shell e com cache curto', async () => {
  const calls = [];
  let clock = 1000;
  const cli = {
    run: async (exe, args, options) => {
      calls.push({ exe, args, options });
      return { stdout: 'GPU, 1, 2, 3, 4\n', stderr: '' };
    },
  };
  const gpuInfo = createGpuInfo({ cli, ttlMs: 4000, now: () => clock });
  const first = await gpuInfo();
  assert.equal(first.memTotalMb, 3);
  assert.equal(calls[0].exe, 'nvidia-smi');
  assert.ok(calls[0].args.every((a) => a.startsWith('--')));
  clock += 1000;
  await gpuInfo();
  assert.equal(calls.length, 1);
  clock += 4000;
  await gpuInfo();
  assert.equal(calls.length, 2);
});

test('RN-11: sem o nvidia-smi devolve nulo e só tenta de novo depois de um minuto', async () => {
  let calls = 0;
  let clock = 0;
  const cli = {
    run: async () => {
      calls += 1;
      throw new HttpError(404, 'nvidia-smi não está instalado');
    },
  };
  const gpuInfo = createGpuInfo({ cli, ttlMs: 4000, now: () => clock });
  assert.equal(await gpuInfo(), null);
  clock += 30000;
  assert.equal(await gpuInfo(), null);
  assert.equal(calls, 1);
  clock += 31000;
  await gpuInfo();
  assert.equal(calls, 2);
});
