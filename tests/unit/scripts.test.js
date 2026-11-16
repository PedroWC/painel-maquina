'use strict';

// Verificação estática dos scripts de instalação (roda em qualquer sistema): confere
// as propriedades de segurança prometidas no ADR 0007 sem executar nada.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SELF_TASK } = require('../../src/protections');

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const read = (name) => fs.readFileSync(path.join(SCRIPTS, name), 'utf8');
const install = read('instalar-tarefa.ps1');
const uninstall = read('desinstalar-tarefa.ps1');

test('ADR 0007: os scripts começam com BOM UTF-8 (o PowerShell 5.1 corrompe acentos sem ele)', () => {
  for (const name of ['instalar-tarefa.ps1', 'desinstalar-tarefa.ps1']) {
    const bytes = fs.readFileSync(path.join(SCRIPTS, name));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], name);
  }
});

test('RN-03: o nome padrão da tarefa é exatamente o que o painel protege', () => {
  const nameOf = (script) => script.match(/\[string\]\$Nome = '([^']+)'/)[1];
  assert.equal(nameOf(install), SELF_TASK);
  assert.equal(nameOf(uninstall), SELF_TASK);
});

test('ADR 0007: a tarefa usa S4U, nível mais alto, início com o Windows e reinício em falha', () => {
  assert.match(install, /-LogonType S4U/);
  assert.match(install, /-RunLevel Highest/);
  assert.match(install, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(install, /-RestartCount 5/);
  // ADR 0013: a opção de reinício sozinha não cobre um processo encerrado à força; o vigia cobre.
  assert.match(install, /New-ScheduledTaskTrigger -Once .*-RepetitionInterval \(New-TimeSpan -Minutes 2\)/s);
  assert.match(install, /-Trigger @\(\$gatilhoInicio, \$gatilhoVigia\)/);
  assert.doesNotMatch(install, /^[^#\r\n]*-RepetitionDuration/m, 'MaxValue é recusado pelo Agendador; omita a duração');
  assert.match(install, /-RestartInterval \(New-TimeSpan -Minutes 1\)/);
  assert.match(install, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/);
  assert.match(install, /-MultipleInstances IgnoreNew/);
  assert.match(install, /-StartWhenAvailable/);
});

test('RNF-09: nenhuma senha ou credencial é pedida, guardada ou passada pelos scripts', () => {
  for (const script of [install, uninstall]) {
    assert.doesNotMatch(script, /-Password|-Credential|SecureString|LogonType Password|Read-Host/i);
    assert.doesNotMatch(script, /Invoke-Expression|\biex\b|DownloadString|Invoke-WebRequest|Invoke-RestMethod/i);
  }
});

test('RN-17: o nome da tarefa é validado por padrão restrito nos dois scripts', () => {
  for (const script of [install, uninstall]) {
    assert.match(script, /\[ValidatePattern\('\^\[A-Za-z0-9_\.-\]\{1,100\}\$'\)\]/);
  }
});

test('ADR 0007: os dois scripts exigem administrador e o instalador confere os pré-requisitos', () => {
  for (const script of [install, uninstall]) assert.match(script, /IsInRole\(\[Security\.Principal\.WindowsBuiltInRole\]::Administrator\)/);
  assert.match(install, /npm run gerar-token/);
  assert.match(install, /npm ci/);
  assert.match(install, /tokenHash/);
  assert.match(install, /Get-Command node/);
});

test('ADR 0007: o desinstalador não apaga configuração, auditoria nem log', () => {
  assert.doesNotMatch(uninstall, /Remove-Item/);
  assert.match(uninstall, /Unregister-ScheduledTask/);
  assert.match(uninstall, /Stop-ScheduledTask/);
});

test('RNF-03: a documentação de instalação cita os dois scripts', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'operacao', 'instalacao.md'), 'utf8');
  assert.match(doc, /instalar-tarefa\.ps1/);
  assert.match(doc, /desinstalar-tarefa\.ps1/);
});
