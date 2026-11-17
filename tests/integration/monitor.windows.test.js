'use strict';

// Testes de sistema (windows): usam o amostrador e o PowerShell reais desta máquina, só para LER
// recursos. O teste de encerramento usa apenas um processo isca criado por ele mesmo.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createSampler } = require('../../src/monitor-sampler');
const { createMonitor } = require('../../src/monitor');
const { createPowerShell } = require('../../src/powershell');
const { PROCESS_KILL } = require('../../src/ps-scripts');

const isWindows = process.platform === 'win32';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('RF-28 e RF-29: leitura real de CPU, RAM, GPU e processos, separados em Windows e programas', { skip: !isWindows, timeout: 90000 }, async () => {
  const sampler = createSampler();
  const monitor = createMonitor({ sampler, ttlMs: 0 });
  try {
    const data = await monitor.snapshot();
    assert.ok(data.cpu.percent >= 0 && data.cpu.percent <= 100);
    assert.ok(data.cpu.cores >= 1);
    assert.ok(data.ram.totalMb > 0);
    assert.ok(data.ram.usedMb > 0 && data.ram.usedMb <= data.ram.totalMb);
    assert.ok(data.ram.percent > 0 && data.ram.percent <= 100);
    // GPU depende da máquina: ou indisponível, ou com valores plausíveis
    if (data.gpu) {
      assert.ok(data.gpu.percent >= 0 && data.gpu.percent <= 100);
      assert.ok(data.gpu.memUsedMb >= 0);
    }
    assert.ok(data.procs.length > 10);
    const own = data.procs.find((p) => p.pid === process.pid);
    assert.ok(own, 'o próprio processo do teste deve aparecer');
    assert.equal(own.category, 'programa');
    assert.ok(own.ramMb > 1);
    assert.ok(data.groups.windows.count > 0, 'deve haver processos nativos do Windows');
    assert.ok(data.groups.programas.count > 0);
    assert.equal(data.procs.filter((p) => p.category === 'windows').length, data.groups.windows.count);
    for (const proc of data.procs) {
      assert.ok(proc.cpu >= 0 && proc.cpu <= 100, `${proc.name}: ${proc.cpu}`);
      assert.ok(proc.ramMb >= 0);
    }
    const system = data.procs.find((p) => p.pid === 4);
    assert.ok(system && system.category === 'windows');

    // a segunda leitura reaproveita o amostrador e é rápida
    const started = Date.now();
    const second = await monitor.snapshot();
    assert.ok(Date.now() - started < 5000, 'a segunda leitura deveria ser rápida');
    assert.ok(second.t >= data.t);
  } finally {
    monitor.shutdown();
  }
  assert.equal(sampler.isRunning(), false);
});

test('RN-20: o script de encerramento recusa processo pelo nome antes de matá-lo', { skip: !isWindows, timeout: 90000 }, async () => {
  const ps = createPowerShell();
  const decoy = spawn(process.execPath, ['-e', 'setTimeout(function () {}, 120000)'], { stdio: 'ignore', windowsHide: true });
  try {
    for (let i = 0; i < 50 && !alive(decoy.pid); i += 1) await wait(50);
    // o nome do isca é "node"; a lista de teste o trata como crítico
    await assert.rejects(ps.run(PROCESS_KILL, { pid: decoy.pid, protectedNames: ['NODE', 'outro'] }), /PROCESSO_PROTEGIDO/);
    assert.equal(alive(decoy.pid), true, 'o processo protegido não pode ter sido encerrado');

    // sem o nome na lista, o mesmo comando encerra
    const name = (await ps.run(PROCESS_KILL, { pid: decoy.pid, protectedNames: ['outro'] })).trim();
    assert.equal(name.toLowerCase(), 'node');
    for (let i = 0; i < 50 && alive(decoy.pid); i += 1) await wait(100);
    assert.equal(alive(decoy.pid), false);
  } finally {
    try {
      decoy.kill();
    } catch {
      // já encerrado
    }
  }
});
