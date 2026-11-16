'use strict';

// Teste de sistema (windows, administrador): instala de verdade uma tarefa descartável
// (PainelTeste_instalador, porta 8791) com o script real, confere as propriedades, usa o
// painel que ela inicia (sob logon S4U) e desinstala. Nunca toca na tarefa PainelMaquina.
// Ignorado sem administrador ou se já existir um config.json (não o sobrescreve).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFile } = require('node:child_process');
const WebSocket = require('ws');
const { createPowerShell } = require('../../src/powershell');
const { detectAdmin } = require('../../src/system');
const { hashToken } = require('../../src/auth');
const { saveConfig, DEFAULTS } = require('../../src/config');

const ROOT = path.join(__dirname, '..', '..');
const CONFIG = path.join(ROOT, 'config.json');
const AUDIT = path.join(ROOT, 'audit.log');
const LOG = path.join(ROOT, 'painel.log');
const NAME = 'PainelTeste_instalador';
const PORT = 8791;
const TOKEN = 'token-do-teste-do-instalador';
const BASE = `http://127.0.0.1:${PORT}`;
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'painel' };

const runnable = process.platform === 'win32' && detectAdmin() && !fs.existsSync(CONFIG);
const ps = createPowerShell();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runScript(script, args = []) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', script), ...args],
      { windowsHide: true, encoding: 'utf8', timeout: 120000 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code || 1) : 0, stdout, stderr }),
    );
  });
}

const portOpen = () =>
  new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });

async function waitFor(condition, ms, step = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await condition()) return true;
    await wait(step);
  }
  return false;
}

const TASK_INFO = `
$t = Get-ScheduledTask -TaskName $p.name
[pscustomobject]@{
  logon = [string]$t.Principal.LogonType
  level = [string]$t.Principal.RunLevel
  triggers = @($t.Triggers | ForEach-Object {
    [pscustomobject]@{ type = $_.CimClass.CimClassName; delay = $_.Delay; interval = $_.Repetition.Interval; duration = $_.Repetition.Duration }
  })
  limit = $t.Settings.ExecutionTimeLimit
  multi = [string]$t.Settings.MultipleInstances
  restart = $t.Settings.RestartCount
  interval = $t.Settings.RestartInterval
  exe = $t.Actions[0].Execute
  args = $t.Actions[0].Arguments
  dir = $t.Actions[0].WorkingDirectory
  desc = $t.Description
} | ConvertTo-Json -Compress
`;

const LISTENER_PID = `
$c = @(Get-NetTCPConnection -LocalPort ([int]$p.port) -State Listen -ErrorAction SilentlyContinue)
if ($c.Count -gt 0) { $c[0].OwningProcess } else { 'null' }
`;

const KILL_PID = `
Stop-Process -Id ([int]$p.pid) -Force
'ok'
`;

const REMOVE_TASK = `
if (Get-ScheduledTask -TaskName $p.name -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $p.name -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $p.name -Confirm:$false
}
Get-NetTCPConnection -LocalPort ([int]$p.port) -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
'ok'
`;

test('ADR 0007: instala, usa e remove a tarefa elevada de verdade', { skip: !runnable, timeout: 480000 }, async () => {
  const existed = { audit: fs.existsSync(AUDIT), log: fs.existsSync(LOG) };
  try {
    // Sem config.json o instalador recusa e não cria a tarefa.
    const missing = await runScript('instalar-tarefa.ps1', ['-Nome', NAME]);
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr + missing.stdout, /gerar-token/);
    assert.equal(await ps.runJson(`[bool](Get-ScheduledTask -TaskName $p.name -ErrorAction SilentlyContinue) | ConvertTo-Json`, { name: NAME }), false);

    // Nome inválido é recusado pela validação do parâmetro.
    assert.notEqual((await runScript('instalar-tarefa.ps1', ['-Nome', 'nome inválido; calc'])).code, 0);

    saveConfig(CONFIG, { ...DEFAULTS, port: PORT, tokenHash: hashToken(TOKEN) });

    const installed = await runScript('instalar-tarefa.ps1', ['-Nome', NAME, '-IniciarAgora']);
    assert.equal(installed.code, 0, installed.stderr || installed.stdout);
    assert.match(installed.stdout, /criada/);

    // Propriedades prometidas no ADR 0007.
    const info = await ps.runJson(TASK_INFO, { name: NAME });
    assert.equal(info.logon, 'S4U');
    assert.equal(info.level, 'Highest');
    assert.equal(info.triggers.length, 2, 'início com o Windows e vigia');
    assert.equal(info.triggers[0].type, 'MSFT_TaskBootTrigger');
    assert.equal(info.triggers[0].delay, 'PT30S');
    assert.equal(info.triggers[1].type, 'MSFT_TaskTimeTrigger');
    assert.equal(info.triggers[1].interval, 'PT2M');
    assert.ok(!info.triggers[1].duration, 'o vigia repete indefinidamente');
    assert.equal(info.limit, 'PT0S');
    assert.equal(info.multi, 'IgnoreNew');
    assert.equal(info.restart, 5);
    assert.equal(info.interval, 'PT1M');
    assert.match(info.exe, /node\.exe$/i);
    assert.ok(info.args.includes('main.js'));
    assert.equal(info.dir.toLowerCase(), ROOT.toLowerCase());
    assert.match(info.desc, /Painel da Máquina/, 'os acentos devem sobreviver (BOM UTF-8)');

    // O painel iniciado pela tarefa sobe, em loopback, e exige login.
    assert.ok(await waitFor(portOpen, 40000), 'o painel deveria estar escutando na porta de teste');
    assert.equal((await fetch(`${BASE}/api/me`)).status, 401);
    const login = await fetch(`${BASE}/api/login`, { method: 'POST', headers: H, body: JSON.stringify({ token: TOKEN }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const api = (method, p, body) =>
      fetch(`${BASE}${p}`, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined });

    // Elevado de verdade mesmo sob S4U e sem sessão interativa.
    assert.equal((await (await api('GET', '/api/me')).json()).admin, true, 'o painel sob S4U deve ser administrador');

    // PowerShell (tarefas) e ConPTY (terminal) funcionam sob S4U.
    assert.equal((await api('GET', '/api/tasks')).status, 200);
    const term = await (await api('POST', '/api/terminals', { shell: 'cmd', name: 'PainelTeste_s4u' })).json();
    assert.equal(term.admin, true);
    const output = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/term?id=${term.id}`, { headers: { cookie, origin: BASE } });
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString('utf8'));
      if (m.t === 'o' || m.t === 'b') output.push(m.d);
    });
    await new Promise((resolve, reject) => (ws.once('open', resolve), ws.once('error', reject)));
    await wait(1500);
    ws.send(JSON.stringify({ t: 'i', d: 'echo painel-s4u-ok\r' }));
    assert.ok(await waitFor(() => output.join('').includes('painel-s4u-ok'), 15000, 200), 'o terminal sob S4U deve executar comandos');
    ws.close();
    await api('DELETE', `/api/terminals/${term.id}`);

    // O log em arquivo foi criado (a tarefa não tem console).
    assert.ok(fs.existsSync(LOG));
    assert.match(fs.readFileSync(LOG, 'utf8'), /Painel em http:\/\/127\.0\.0\.1:8791/);

    // Reinstalar atualiza a mesma tarefa, sem duplicar.
    const again = await runScript('instalar-tarefa.ps1', ['-Nome', NAME]);
    assert.equal(again.code, 0);
    assert.match(again.stdout, /atualizada/);

    // RNF-03 (ADR 0013): se o processo for encerrado à força, o vigia o sobe de novo. Leva cerca
    // de 2 minutos, então só roda no CI ou com PAINEL_TESTES_LENTOS=1.
    if (process.env.CI || process.env.PAINEL_TESTES_LENTOS === '1') {
      const before = await ps.runJson(LISTENER_PID, { port: PORT });
      assert.ok(before, 'deveria haver um processo escutando');
      await ps.run(KILL_PID, { pid: before });
      assert.ok(await waitFor(async () => !(await portOpen()), 10000, 250), 'o painel deveria ter caído');
      let after = null;
      assert.ok(
        await waitFor(async () => {
          after = await ps.runJson(LISTENER_PID, { port: PORT });
          return after && after !== before;
        }, 200000, 5000),
        'o vigia deveria ter reiniciado o painel em até alguns minutos',
      );
      assert.notEqual(after, before);
    }

    // Desinstalar para o painel e remove a tarefa, mantendo os arquivos de configuração.
    const removed = await runScript('desinstalar-tarefa.ps1', ['-Nome', NAME]);
    assert.equal(removed.code, 0, removed.stderr || removed.stdout);
    assert.match(removed.stdout, /removida/);
    assert.equal(await ps.runJson(`[bool](Get-ScheduledTask -TaskName $p.name -ErrorAction SilentlyContinue) | ConvertTo-Json`, { name: NAME }), false);
    assert.ok(await waitFor(async () => !(await portOpen()), 20000), 'o painel deveria parar junto com a tarefa');
    assert.ok(fs.existsSync(CONFIG), 'a configuração é mantida');

    // Desinstalar de novo é inofensivo.
    const nothing = await runScript('desinstalar-tarefa.ps1', ['-Nome', NAME]);
    assert.equal(nothing.code, 0);
    assert.match(nothing.stdout, /Nada a remover/);
  } finally {
    await ps.run(REMOVE_TASK, { name: NAME, port: PORT }).catch(() => {});
    await wait(500);
    fs.rmSync(CONFIG, { force: true });
    if (!existed.audit) fs.rmSync(AUDIT, { force: true });
    if (!existed.log) fs.rmSync(LOG, { force: true });
  }
});
