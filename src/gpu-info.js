'use strict';

// Dados extras da GPU quando há uma NVIDIA com o nvidia-smi instalado: memória total, temperatura
// e nome. É opcional (RN-11): sem a ferramenta, o painel usa só os contadores do Windows. O
// executável é fixo e roda por execFile, sem shell e sem entrada do cliente (RN-12).

const QUERY = ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'];
const ABSENT_TTL_MS = 60000;

const number = (text) => {
  const value = Number(String(text).trim());
  return Number.isFinite(value) ? value : null;
};

// Uma linha por GPU: "NVIDIA GeForce GTX 1080, 5, 1102, 8192, 41". Valores "[N/A]" viram null.
function parseNvidia(text) {
  const rows = String(text)
    .split(/\r?\n/)
    .map((line) => line.split(',').map((part) => part.trim()))
    .filter((parts) => parts.length >= 5 && parts[0] !== '');
  if (rows.length === 0) return null;
  const sum = (index) => rows.reduce((total, row) => total + (number(row[index]) || 0), 0);
  const temps = rows.map((row) => number(row[4])).filter((value) => value !== null);
  return {
    name: rows.map((row) => row[0]).join(' + '),
    percent: Math.max(...rows.map((row) => number(row[1]) || 0)),
    memUsedMb: sum(2),
    memTotalMb: sum(3) || null,
    temperatureC: temps.length > 0 ? Math.max(...temps) : null,
  };
}

function createGpuInfo({ cli, ttlMs = 4000, now = Date.now } = {}) {
  let cache = null;
  return async function gpuInfo() {
    const at = now();
    if (cache && at < cache.until) return cache.value;
    let value = null;
    let until = at + ttlMs;
    try {
      const { stdout } = await cli.run('nvidia-smi', QUERY, { timeoutMs: 5000 });
      value = parseNvidia(stdout);
    } catch {
      until = at + ABSENT_TTL_MS; // não instalada ou sem driver: não insiste a cada leitura
    }
    cache = { value, until };
    return value;
  };
}

module.exports = { createGpuInfo, parseNvidia };
