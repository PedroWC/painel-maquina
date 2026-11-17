'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMonitor, createClassifier, cpuTimes } = require('../../src/monitor');

const MB = 1024 * 1024;

// os simulado: 2 núcleos; cada leitura devolve os tempos programados.
function fakeOs(steps) {
  let index = -1;
  return {
    advance: () => {
      index += 1;
    },
    cpus: () => {
      const t = steps[Math.min(steps.length - 1, Math.max(0, index))];
      return [{ times: t }, { times: t }];
    },
    totalmem: () => 16 * 1024 * MB,
    freemem: () => 4 * 1024 * MB,
  };
}

function rawSample(t, procs, gpu = null, gpuNames = []) {
  return { ok: true, t, procs, gpu, gpuNames };
}

function makeMonitor({ samples, osSteps, gpuInfo, isProtected, ttlMs = 0 }) {
  let call = 0;
  const osModule = fakeOs(osSteps);
  const sampler = {
    stopped: 0,
    sample: async () => {
      osModule.advance();
      const next = samples[Math.min(call, samples.length - 1)];
      call += 1;
      if (next instanceof Error) throw next;
      return next;
    },
    stop() {
      sampler.stopped += 1;
    },
  };
  const monitor = createMonitor({
    sampler,
    osModule,
    gpuInfo,
    isProtected,
    ttlMs,
    warmupMs: 0,
    delay: async () => {},
    classify: createClassifier({ systemRoot: 'C:/Windows', programFiles: 'C:/Program Files', programData: 'C:/ProgramData' }),
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  });
  return { monitor, sampler, calls: () => call };
}

const PROCS_A = [
  { p: 0, n: 'Idle', c: 0, w: 0, x: null },
  { p: 4, n: 'System', c: 1000, w: 1 * MB, x: null },
  { p: 100, n: 'svchost', c: 1000, w: 50 * MB, x: 'C:/Windows/System32/svchost.exe' },
  { p: 200, n: 'chrome', c: 5000, w: 300 * MB, x: 'C:/Program Files/Google/Chrome/chrome.exe' },
  { p: 300, n: 'MsMpEng', c: 100, w: 200 * MB, x: 'C:/ProgramData/Microsoft/Windows Defender/Platform/4.18/MsMpEng.exe' },
];

test('RN-19: processos dentro da pasta do Windows ou do Defender são nativos; o resto é programa', () => {
  const classify = createClassifier({ systemRoot: 'C:/Windows', programFiles: 'C:/Program Files', programData: 'C:/ProgramData' });
  assert.equal(classify({ pid: 100, name: 'svchost', exe: 'C:/Windows/System32/svchost.exe' }), 'windows');
  assert.equal(classify({ pid: 100, name: 'x', exe: 'c:/windows/explorer.exe' }), 'windows');
  assert.equal(classify({ pid: 100, name: 'x', exe: 'C:/Program Files/Windows Defender/MsMpEng.exe' }), 'windows');
  assert.equal(classify({ pid: 100, name: 'x', exe: 'C:/Program Files/Google/Chrome/chrome.exe' }), 'programa');
  // pasta parecida não conta: "C:/Windows.old" não é "C:/Windows"
  assert.equal(classify({ pid: 100, name: 'x', exe: 'C:/Windows.old/x.exe' }), 'programa');
  assert.equal(classify({ pid: 100, name: 'x', exe: 'C:/Users/ana/Windows/x.exe' }), 'programa');
});

test('RN-19: sem caminho legível, só o núcleo e os processos críticos contam como Windows', () => {
  const classify = createClassifier({ systemRoot: 'C:/Windows' });
  for (const name of ['System', 'Registry', 'Memory Compression', 'svchost', 'csrss', 'lsass']) {
    assert.equal(classify({ pid: 500, name, exe: null }), 'windows', name);
  }
  assert.equal(classify({ pid: 500, name: 'chrome', exe: null }), 'programa');
  assert.equal(classify({ pid: 3, name: 'qualquer', exe: null }), 'windows');
});

test('RF-28: calcula CPU geral, RAM e CPU por processo a partir das leituras', async () => {
  const procsB = PROCS_A.map((p) => (p.p === 200 ? { ...p, c: 5000 + 400 } : p.p === 100 ? { ...p, c: 1000 + 100 } : p));
  const { monitor } = makeMonitor({
    samples: [rawSample(10000, PROCS_A), rawSample(12000, procsB)],
    // 2 núcleos; entre as leituras: ocupado 1000 de 4000 → 25%
    osSteps: [
      { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      { user: 500, nice: 0, sys: 0, idle: 1500, irq: 0 },
    ],
  });
  const data = await monitor.snapshot();
  assert.equal(data.cpu.percent, 25);
  assert.equal(data.cpu.cores, 2);
  assert.deepEqual(data.ram, { totalMb: 16384, usedMb: 12288, percent: 75 });
  const chrome = data.procs.find((p) => p.name === 'chrome');
  // 400 ms de CPU em 2000 ms com 2 núcleos → 10% da máquina
  assert.equal(chrome.cpu, 10);
  assert.equal(chrome.ramMb, 300);
  assert.equal(data.procs.find((p) => p.name === 'svchost').cpu, 2.5);
  assert.equal(data.procs.some((p) => p.pid === 0), false);
});

test('RF-29: separa o consumo entre Windows e programas e soma por grupo', async () => {
  const { monitor } = makeMonitor({
    samples: [rawSample(1000, PROCS_A), rawSample(3000, PROCS_A.map((p) => (p.p === 200 ? { ...p, c: 5800 } : p)))],
    osSteps: [
      { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      { user: 100, nice: 0, sys: 0, idle: 100, irq: 0 },
    ],
  });
  const { groups, procs } = await monitor.snapshot();
  assert.deepEqual(procs.filter((p) => p.category === 'windows').map((p) => p.name).sort(), ['MsMpEng', 'System', 'svchost']);
  assert.equal(groups.windows.count, 3);
  assert.equal(groups.programas.count, 1);
  assert.equal(groups.programas.cpu, 20); // 800 ms / (2000 ms × 2 núcleos)
  assert.equal(groups.windows.ramMb, 251);
  assert.equal(groups.programas.ramMb, 300);
});

test('RF-28: a primeira leitura espera e lê de novo para ter taxas; as seguintes não', async () => {
  const { monitor, calls } = makeMonitor({
    samples: [rawSample(1000, PROCS_A), rawSample(2000, PROCS_A)],
    osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }],
  });
  await monitor.snapshot();
  assert.equal(calls(), 2);
  await monitor.snapshot();
  assert.equal(calls(), 3);
});

test('RN-21: leituras simultâneas compartilham uma só coleta e há cache curto', async () => {
  const { monitor, calls } = makeMonitor({
    samples: [rawSample(1000, PROCS_A), rawSample(2000, PROCS_A)],
    osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }],
    ttlMs: 60000,
  });
  const [a, b, c] = await Promise.all([monitor.snapshot(), monitor.snapshot(), monitor.snapshot()]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(calls(), 2); // aquecimento (2) uma única vez
  assert.equal(await monitor.snapshot(), a); // cache ainda válido
  assert.equal(calls(), 2);
});

test('RF-28: GPU por processo e geral vêm dos contadores; memória total e temperatura do nvidia-smi', async () => {
  const gpu = { util: 37.5, memUsed: 2048 * MB, procs: [{ p: 200, u: 30, m: 512 * MB }] };
  const { monitor } = makeMonitor({
    samples: [rawSample(1000, PROCS_A, gpu, ['GPU Teste']), rawSample(2000, PROCS_A, gpu, ['GPU Teste'])],
    osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }],
    gpuInfo: async () => ({ name: 'NVIDIA X', percent: 99, memUsedMb: 1, memTotalMb: 8192, temperatureC: 55 }),
  });
  const data = await monitor.snapshot();
  assert.deepEqual(data.gpu, {
    percent: 37.5,
    memUsedMb: 2048,
    memTotalMb: 8192,
    temperatureC: 55,
    names: ['GPU Teste'],
    perProcess: true,
  });
  const chrome = data.procs.find((p) => p.name === 'chrome');
  assert.equal(chrome.gpu, 30);
  assert.equal(chrome.gpuMemMb, 512);
  assert.equal(data.procs.find((p) => p.name === 'svchost').gpu, 0);
  assert.equal(data.groups.programas.gpu, 30);
});

test('RF-28: sem contadores, a GPU usa o nvidia-smi e some por processo; sem nada, fica indisponível', async () => {
  const base = { osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }] };
  const only = makeMonitor({
    ...base,
    samples: [rawSample(1000, PROCS_A), rawSample(2000, PROCS_A)],
    gpuInfo: async () => ({ name: 'NVIDIA X', percent: 12, memUsedMb: 900, memTotalMb: 8192, temperatureC: null }),
  });
  const data = await only.monitor.snapshot();
  assert.equal(data.gpu.percent, 12);
  assert.equal(data.gpu.perProcess, false);
  assert.deepEqual(data.gpu.names, ['NVIDIA X']);
  assert.equal(data.procs[0].gpu, null);

  const none = makeMonitor({ ...base, samples: [rawSample(1000, PROCS_A), rawSample(2000, PROCS_A)] });
  assert.equal((await none.monitor.snapshot()).gpu, null);

  const failing = makeMonitor({
    ...base,
    samples: [rawSample(1000, PROCS_A), rawSample(2000, PROCS_A)],
    gpuInfo: async () => {
      throw new Error('sem driver');
    },
  });
  assert.equal((await failing.monitor.snapshot()).gpu, null);
});

test('RN-20: o monitor marca como protegidos os processos que a regra indicar', async () => {
  const { monitor } = makeMonitor({
    samples: [rawSample(1000, PROCS_A), rawSample(2000, PROCS_A)],
    osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }],
    isProtected: (pid, name) => pid <= 4 || name === 'svchost',
  });
  const { procs } = await monitor.snapshot();
  assert.deepEqual(procs.filter((p) => p.protected).map((p) => p.name).sort(), ['System', 'svchost']);
});

test('RF-28: processo novo entre leituras e contador que diminuiu não geram CPU negativa nem absurda', async () => {
  const after = [
    { p: 200, n: 'chrome', c: 10, w: 1 * MB, x: null }, // contador menor que antes (pid reaproveitado)
    { p: 999, n: 'novo', c: 99999, w: 1 * MB, x: null }, // não existia antes
  ];
  const { monitor } = makeMonitor({
    samples: [rawSample(1000, PROCS_A), rawSample(2000, after)],
    osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }],
  });
  const { procs } = await monitor.snapshot();
  assert.equal(procs.find((p) => p.pid === 200).cpu, 0);
  assert.equal(procs.find((p) => p.pid === 999).cpu, 0);
});

test('RNF-12: o amostrador é parado quando ninguém consulta e no desligamento', async () => {
  const timers = [];
  let call = 0;
  const osModule = fakeOs([{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }]);
  const sampler = {
    stopped: 0,
    sample: async () => {
      osModule.advance();
      call += 1;
      return rawSample(1000 * call, PROCS_A);
    },
    stop() {
      sampler.stopped += 1;
    },
  };
  const monitor = createMonitor({
    sampler,
    osModule,
    ttlMs: 0,
    warmupMs: 0,
    idleMs: 5000,
    delay: async () => {},
    setTimer: (fn, ms) => {
      const timer = { fn, ms, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimer: () => {},
  });
  await monitor.snapshot();
  const idle = timers[timers.length - 1];
  assert.equal(idle.ms, 5000);
  idle.fn(); // ocioso: para o amostrador e esquece as leituras
  assert.equal(sampler.stopped, 1);
  const before = call;
  await monitor.snapshot();
  assert.equal(call - before, 2); // precisou aquecer de novo
  monitor.shutdown();
  assert.equal(sampler.stopped, 2);
});

test('RF-28: falha do amostrador propaga o erro e a leitura seguinte tenta de novo', async () => {
  const ok = rawSample(2000, PROCS_A);
  const { monitor } = makeMonitor({
    samples: [new Error('amostrador caiu'), rawSample(1000, PROCS_A), ok],
    osSteps: [{ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }, { user: 1, nice: 0, sys: 0, idle: 1, irq: 0 }],
  });
  await assert.rejects(() => monitor.snapshot(), /amostrador caiu/);
  const data = await monitor.snapshot();
  assert.ok(data.procs.length > 0);
});

test('RF-28: cpuTimes soma ocupado e total de todos os núcleos', () => {
  const osModule = { cpus: () => [{ times: { user: 1, nice: 2, sys: 3, idle: 4, irq: 5 } }, { times: { user: 1, nice: 0, sys: 1, idle: 8, irq: 0 } }] };
  assert.deepEqual(cpuTimes(osModule), { busy: 13, total: 25 });
});
