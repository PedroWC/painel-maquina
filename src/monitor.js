'use strict';

// Monitor de recursos (RF-28 a RF-30, RN-19, ADR 0015): combina o amostrador de processos e
// GPU com os totais de CPU e memória do próprio Node, classifica cada processo como "windows"
// (nativo) ou "programa" e agrupa o consumo. Tudo é injetável para os testes.

const os = require('node:os');
const path = require('node:path');
const { CRITICAL_PROCESSES } = require('./protections');

const MB = 1024 * 1024;
const MAX_PROCS = 400;

// Processos do núcleo que não têm caminho de executável legível; contam como do Windows.
// Os processos críticos do Windows (csrss, svchost...) também entram: são todos nativos.
const KERNEL_NAMES = new Set(['system', 'registry', 'idle', 'system idle process', 'memory compression', 'secure system', ...CRITICAL_PROCESSES]);

const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// RN-19: "nativo" = executável dentro da pasta do Windows ou do Windows Defender, ou núcleo do
// sistema. Todo o resto é "programa". Sem caminho legível (painel sem elevação), só o núcleo
// conhecido conta como Windows.
function createClassifier({ systemRoot, programFiles, programData } = {}) {
  const win = path.win32;
  const roots = [
    systemRoot || process.env.SystemRoot || 'C:\\Windows',
    win.join(programFiles || process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender'),
    win.join(programData || process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender'),
  ].map((root) => `${win.normalize(root).toLowerCase().replace(/[\\/]+$/, '')}${win.sep}`);

  return function classify({ pid, name, exe }) {
    if (pid <= 4) return 'windows';
    if (typeof exe === 'string' && exe !== '') {
      const normalized = win.normalize(exe).toLowerCase();
      return roots.some((root) => normalized.startsWith(root)) ? 'windows' : 'programa';
    }
    return KERNEL_NAMES.has(String(name || '').toLowerCase()) ? 'windows' : 'programa';
  };
}

function cpuTimes(osModule) {
  let busy = 0;
  let total = 0;
  for (const cpu of osModule.cpus()) {
    const { user, nice, sys, idle, irq } = cpu.times;
    busy += user + nice + sys + irq;
    total += user + nice + sys + irq + idle;
  }
  return { busy, total };
}

function emptyGroup() {
  return { count: 0, cpu: 0, ramMb: 0, gpu: 0 };
}

function createMonitor({
  sampler,
  gpuInfo = async () => null,
  osModule = os,
  classify = createClassifier(),
  isProtected = () => false,
  now = Date.now,
  ttlMs = 1000,
  idleMs = 120000,
  warmupMs = 600,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let previous = null; // { raw, cpu }
  let cache = null; // { at, data }
  let inflight = null;
  let idleTimer = null;

  function build(raw, before, cpuNow, cpuBefore, gpuExtra) {
    const cores = Math.max(1, osModule.cpus().length);
    const dt = Math.max(1, raw.t - before.t);
    const beforeCpu = new Map(before.procs.map((p) => [p.p, p.c]));
    const gpuByPid = new Map();
    if (raw.gpu && Array.isArray(raw.gpu.procs)) for (const g of raw.gpu.procs) gpuByPid.set(g.p, g);
    const hasGpuCounters = Boolean(raw.gpu);

    const groups = { windows: emptyGroup(), programas: emptyGroup() };
    const procs = [];
    for (const proc of raw.procs) {
      if (proc.p === 0) continue; // "Idle" não é um processo de verdade
      const earlier = beforeCpu.get(proc.p);
      const cpu = earlier === undefined ? 0 : clamp(((proc.c - earlier) / (dt * cores)) * 100, 0, 100);
      const gpu = gpuByPid.get(proc.p);
      const category = classify({ pid: proc.p, name: proc.n, exe: proc.x });
      const row = {
        pid: proc.p,
        name: proc.n,
        category,
        cpu: round1(cpu),
        ramMb: round1(proc.w / MB),
        gpu: hasGpuCounters ? (gpu ? gpu.u : 0) : null,
        gpuMemMb: hasGpuCounters ? round1((gpu ? gpu.m : 0) / MB) : null,
        protected: Boolean(isProtected(proc.p, proc.n)),
      };
      procs.push(row);
      const group = groups[category === 'windows' ? 'windows' : 'programas'];
      group.count += 1;
      group.cpu += row.cpu;
      group.ramMb += row.ramMb;
      if (row.gpu !== null) group.gpu += row.gpu;
    }
    for (const group of Object.values(groups)) {
      group.cpu = round1(clamp(group.cpu, 0, 100));
      group.ramMb = round1(group.ramMb);
      group.gpu = round1(clamp(group.gpu, 0, 100));
    }

    const dTotal = cpuNow.total - cpuBefore.total;
    const cpuPercent = dTotal > 0 ? clamp(((cpuNow.busy - cpuBefore.busy) / dTotal) * 100, 0, 100) : 0;
    const totalMem = osModule.totalmem();
    const usedMem = totalMem - osModule.freemem();

    let gpu = null;
    if (raw.gpu || gpuExtra) {
      gpu = {
        percent: round1(raw.gpu ? raw.gpu.util : gpuExtra.percent),
        memUsedMb: raw.gpu ? round1(raw.gpu.memUsed / MB) : gpuExtra.memUsedMb,
        memTotalMb: gpuExtra && gpuExtra.memTotalMb !== undefined ? gpuExtra.memTotalMb : null,
        temperatureC: gpuExtra && gpuExtra.temperatureC !== undefined ? gpuExtra.temperatureC : null,
        names: Array.isArray(raw.gpuNames) && raw.gpuNames.length > 0 ? raw.gpuNames : gpuExtra && gpuExtra.name ? [gpuExtra.name] : [],
        perProcess: hasGpuCounters,
      };
    }

    return {
      t: now(),
      cpu: { percent: round1(cpuPercent), cores },
      ram: {
        totalMb: round1(totalMem / MB),
        usedMb: round1(usedMem / MB),
        percent: round1(totalMem > 0 ? (usedMem / totalMem) * 100 : 0),
      },
      gpu,
      groups,
      procs: procs.slice(0, MAX_PROCS),
    };
  }

  async function collect() {
    let raw = await sampler.sample();
    let cpu = cpuTimes(osModule);
    if (!previous) {
      // Sem leitura anterior não há como calcular taxas: espera um instante e lê de novo.
      previous = { raw, cpu };
      await delay(warmupMs);
      raw = await sampler.sample();
      cpu = cpuTimes(osModule);
    }
    let gpuExtra = null;
    try {
      gpuExtra = await gpuInfo();
    } catch {
      gpuExtra = null;
    }
    const data = build(raw, previous.raw, cpu, previous.cpu, gpuExtra);
    previous = { raw, cpu };
    cache = { at: now(), data };
    return data;
  }

  function scheduleIdle() {
    if (idleTimer) clearTimer(idleTimer);
    idleTimer = setTimer(() => {
      idleTimer = null;
      // Ninguém consulta há um tempo: encerra o amostrador e esquece as leituras antigas.
      sampler.stop();
      previous = null;
      cache = null;
    }, idleMs);
    if (idleTimer && typeof idleTimer.unref === 'function') idleTimer.unref();
  }

  // Várias abas ou clientes compartilham a mesma leitura (RN-21): cache curto e chamada única.
  function snapshot() {
    if (cache && now() - cache.at < ttlMs) {
      scheduleIdle();
      return Promise.resolve(cache.data);
    }
    if (!inflight) {
      inflight = collect().finally(() => {
        inflight = null;
        scheduleIdle();
      });
    }
    return inflight;
  }

  function shutdown() {
    if (idleTimer) clearTimer(idleTimer);
    idleTimer = null;
    sampler.stop();
    previous = null;
    cache = null;
  }

  return { snapshot, shutdown };
}

module.exports = { createMonitor, createClassifier, cpuTimes, KERNEL_NAMES };
