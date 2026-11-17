'use strict';

// Amostrador de recursos (RF-28, ADR 0015). Um PowerShell que fica vivo e responde a cada linha
// "snap" com uma linha JSON: processos (tempo de CPU, memória e caminho do executável) e uso da
// GPU por processo e geral. Manter o processo vivo é o que torna a leitura barata: dentro dele,
// listar processos leva milissegundos e os contadores de GPU só pagam a inicialização uma vez;
// um PowerShell novo a cada leitura levaria vários segundos.
//
// O script é ESTÁTICO (ADR 0006): nada vindo do cliente entra nele.

const path = require('node:path');
const { spawn: nodeSpawn } = require('node:child_process');
const { encode } = require('./powershell');

const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

const MAX_BUFFER_CHARS = 8 * 1024 * 1024;

const SCRIPT = String.raw`
$ErrorActionPreference = 'Continue'
$script:pathCache = @{}
$gpuNames = @()
try { $gpuNames = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) } catch {}

# Contadores de GPU (Windows 10 1709 ou superior). Se faltarem, a GPU fica indisponível.
$engine = $null; $procMem = $null; $adapterMem = $null
try {
  $engine = [Diagnostics.PerformanceCounterCategory]::new('GPU Engine')
  $procMem = [Diagnostics.PerformanceCounterCategory]::new('GPU Process Memory')
  $adapterMem = [Diagnostics.PerformanceCounterCategory]::new('GPU Adapter Memory')
  $null = $engine.ReadCategory()
} catch { $engine = $null }
$script:prevEngine = $null
$engineRx = [regex]'^pid_(\d+)_luid_(\S+?)_phys_\d+_eng_\d+_engtype_(.+)$'
$pidRx = [regex]'^pid_(\d+)_'

function Read-Gpu {
  if (-not $engine) { return $null }
  $cur = $engine.ReadCategory()['utilization percentage']
  $perPid = @{}; $perAdapter = @{}
  if ($script:prevEngine) {
    foreach ($inst in @($cur.Keys)) {
      if (-not $script:prevEngine.Contains($inst)) { continue }
      $m = $engineRx.Match($inst)
      if (-not $m.Success) { continue }
      try { $v = [Diagnostics.CounterSample]::Calculate($script:prevEngine[$inst].Sample, $cur[$inst].Sample) } catch { continue }
      if ($v -le 0) { continue }
      $kp = $m.Groups[1].Value + '|' + $m.Groups[3].Value
      $ka = $m.Groups[2].Value + '|' + $m.Groups[3].Value
      $perPid[$kp] = [double]$perPid[$kp] + $v
      $perAdapter[$ka] = [double]$perAdapter[$ka] + $v
    }
  }
  $script:prevEngine = $cur

  $byPid = @{}
  foreach ($k in $perPid.Keys) {
    $id = $k.Split('|')[0]
    if (-not $byPid.ContainsKey($id) -or $perPid[$k] -gt $byPid[$id].u) { $byPid[$id] = @{ u = [double]$perPid[$k]; m = 0.0 } }
  }
  $util = 0.0
  foreach ($k in $perAdapter.Keys) { if ($perAdapter[$k] -gt $util) { $util = [double]$perAdapter[$k] } }

  try {
    foreach ($d in $procMem.ReadCategory()['dedicated usage'].Values) {
      $m = $pidRx.Match($d.InstanceName)
      if (-not $m.Success -or $d.RawValue -le 0) { continue }
      $id = $m.Groups[1].Value
      if (-not $byPid.ContainsKey($id)) { $byPid[$id] = @{ u = 0.0; m = 0.0 } }
      $byPid[$id].m = [double]$byPid[$id].m + $d.RawValue
    }
  } catch {}
  $memUsed = 0.0
  try { foreach ($d in $adapterMem.ReadCategory()['dedicated usage'].Values) { $memUsed += $d.RawValue } } catch {}

  $list = @($byPid.Keys | ForEach-Object { [pscustomobject]@{ p = [int]$_; u = [math]::Round([math]::Min(100.0, $byPid[$_].u), 1); m = [double]$byPid[$_].m } })
  return [pscustomobject]@{ util = [math]::Round([math]::Min(100.0, $util), 1); memUsed = $memUsed; procs = $list }
}

function Update-Paths($ids) {
  $missing = $false
  foreach ($id in $ids) { if (-not $script:pathCache.ContainsKey($id)) { $missing = $true; break } }
  if (-not $missing) { return }
  $fresh = @{}
  try {
    Get-CimInstance Win32_Process -Property ProcessId,ExecutablePath | ForEach-Object { $fresh[[int]$_.ProcessId] = $_.ExecutablePath }
  } catch {}
  foreach ($id in $ids) { if (-not $fresh.ContainsKey($id)) { $fresh[$id] = $null } }
  $script:pathCache = $fresh
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $list = New-Object System.Collections.ArrayList
    foreach ($proc in [Diagnostics.Process]::GetProcesses()) {
      try {
        $cpu = 0.0
        try { $cpu = $proc.TotalProcessorTime.TotalMilliseconds } catch {}
        [void]$list.Add([pscustomobject]@{ p = $proc.Id; n = $proc.ProcessName; c = [math]::Round($cpu); w = $proc.WorkingSet64; x = $null })
      } catch {} finally { $proc.Dispose() }
    }
    Update-Paths @($list | ForEach-Object { $_.p })
    foreach ($item in $list) { $item.x = $script:pathCache[$item.p] }
    $gpu = $null
    try { $gpu = Read-Gpu } catch { $gpu = $null }
    $stamp = [math]::Round([Diagnostics.Stopwatch]::GetTimestamp() * 1000.0 / [Diagnostics.Stopwatch]::Frequency)
    $out = [pscustomobject]@{ ok = $true; t = $stamp; procs = $list.ToArray(); gpu = $gpu; gpuNames = $gpuNames }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $out -Compress -Depth 6))
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject ([pscustomobject]@{ ok = $false; error = [string]$_.Exception.Message }) -Compress))
  }
  [Console]::Out.Flush()
}
`;

// Cria o cliente do amostrador. O processo só existe enquanto alguém consulta (o monitor chama
// stop() quando fica ocioso) e sobe de novo na próxima leitura.
function createSampler({
  spawn = nodeSpawn,
  executable = POWERSHELL,
  firstTimeoutMs = 45000,
  timeoutMs = 15000,
  env = process.env,
} = {}) {
  let child = null;
  let buffer = '';
  let waiting = null;
  let warm = false;

  function settle(error, value) {
    if (!waiting) return;
    const current = waiting;
    waiting = null;
    clearTimeout(current.timer);
    if (error) current.reject(error);
    else current.resolve(value);
  }

  function kill() {
    const current = child;
    child = null;
    warm = false;
    buffer = '';
    if (!current) return;
    try {
      current.stdin.end();
    } catch {
      // o processo pode já ter saído
    }
    try {
      current.kill();
    } catch {
      // idem
    }
  }

  function onData(chunk) {
    buffer += chunk;
    if (buffer.length > MAX_BUFFER_CHARS) {
      kill();
      settle(new Error('Resposta do amostrador grande demais.'));
      return;
    }
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      // Só linhas JSON são respostas; avisos soltos do PowerShell são ignorados.
      if (line.startsWith('{') && waiting) {
        try {
          const data = JSON.parse(line);
          if (data.ok === false) settle(new Error(String(data.error || 'Falha do amostrador.')));
          else {
            warm = true;
            settle(null, data);
          }
        } catch {
          settle(new Error('Resposta inválida do amostrador.'));
        }
      }
      index = buffer.indexOf('\n');
    }
  }

  function start() {
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(SCRIPT)];
    const created = spawn(executable, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...env, PP_PARAMS: '{}' },
    });
    child = created;
    buffer = '';
    warm = false;
    created.stdout.setEncoding('utf8');
    created.stdout.on('data', onData);
    created.stdin.on('error', () => {});
    created.on('error', (err) => {
      if (child === created) child = null;
      settle(err);
    });
    created.on('exit', () => {
      if (child === created) child = null;
      settle(new Error('O amostrador de recursos encerrou.'));
    });
  }

  function sample() {
    return new Promise((resolve, reject) => {
      if (waiting) return reject(new Error('Já existe uma leitura em andamento.'));
      if (!child) start();
      const timer = setTimeout(() => {
        kill();
        settle(new Error('Tempo esgotado ao ler os recursos da máquina.'));
      }, warm ? timeoutMs : firstTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      waiting = { resolve, reject, timer };
      try {
        child.stdin.write('snap\n');
      } catch (err) {
        kill();
        settle(err);
      }
      return undefined;
    });
  }

  function stop() {
    kill();
    settle(new Error('O amostrador de recursos foi parado.'));
  }

  return { sample, stop, isRunning: () => child !== null };
}

module.exports = { createSampler, SCRIPT };
