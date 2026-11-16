'use strict';

// Scripts PowerShell estáticos (ADR 0006). Os dados do usuário chegam em $p
// (JSON da variável PP_PARAMS). Não use crases nem interpolação de dados aqui.

const TASK_PRELUDE = `
$exists = Get-ScheduledTask -TaskName $p.name -TaskPath $p.path -ErrorAction SilentlyContinue
`;

const TASK_LIST = `
function Trg($t) {
  $c = $t.CimClass.CimClassName
  $when = ''
  if ($t.StartBoundary) { try { $when = ([datetime]$t.StartBoundary).ToString('HH:mm') } catch {} }
  switch ($c) {
    'MSFT_TaskDailyTrigger' { 'Diário ' + $when }
    'MSFT_TaskWeeklyTrigger' { 'Semanal ' + $when }
    'MSFT_TaskLogonTrigger' { 'Ao fazer logon' }
    'MSFT_TaskBootTrigger' { 'Na inicialização' }
    'MSFT_TaskTimeTrigger' { 'Uma vez ' + $when }
    default { $c -replace '^MSFT_Task','' -replace 'Trigger$','' }
  }
}
$all = [bool]$p.all
$tasks = Get-ScheduledTask | Where-Object { $all -or $_.TaskPath -notlike '\\Microsoft\\*' }
$out = @(foreach ($t in $tasks) {
  $i = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction SilentlyContinue
  $a = @($t.Actions | Select-Object -First 1)[0]
  [pscustomobject]@{
    name = $t.TaskName
    path = $t.TaskPath
    state = [string]$t.State
    enabled = ($t.State -ne 'Disabled')
    user = $t.Principal.UserId
    highest = ($t.Principal.RunLevel -eq 'Highest')
    next = if ($i -and $i.NextRunTime -and $i.NextRunTime.Year -gt 2000) { $i.NextRunTime.ToString('o') } else { $null }
    last = if ($i -and $i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $i.LastRunTime.ToString('o') } else { $null }
    result = if ($i) { $i.LastTaskResult } else { $null }
    command = if ($a) { $a.Execute } else { '' }
    args = if ($a) { $a.Arguments } else { '' }
    workdir = if ($a) { $a.WorkingDirectory } else { '' }
    triggers = (@($t.Triggers | ForEach-Object { Trg $_ }) -join ', ')
  }
})
ConvertTo-Json -InputObject $out -Compress -Depth 3
`;

const TASK_ACTION = `${TASK_PRELUDE}
if (-not $exists) { throw 'TAREFA_NAO_EXISTE' }
switch ($p.op) {
  'run' {
    if ($exists.State -eq 'Disabled') { throw 'TAREFA_DESATIVADA' }
    Start-ScheduledTask -TaskName $p.name -TaskPath $p.path
  }
  'stop' { Stop-ScheduledTask -TaskName $p.name -TaskPath $p.path }
  'enable' { Enable-ScheduledTask -TaskName $p.name -TaskPath $p.path | Out-Null }
  'disable' { Disable-ScheduledTask -TaskName $p.name -TaskPath $p.path | Out-Null }
  'delete' { Unregister-ScheduledTask -TaskName $p.name -TaskPath $p.path -Confirm:$false }
  default { throw 'OPERACAO_INVALIDA' }
}
'ok'
`;

const TASK_SAVE = `${TASK_PRELUDE}
function MkTrigger($tr) {
  if (-not $tr) { return $null }
  $time = if ($tr.time) { $tr.time } else { '03:00' }
  switch ($tr.type) {
    'daily' { New-ScheduledTaskTrigger -Daily -At $time }
    'weekly' { New-ScheduledTaskTrigger -Weekly -DaysOfWeek ([string[]]$tr.days) -At $time }
    'logon' { New-ScheduledTaskTrigger -AtLogOn }
    'startup' { New-ScheduledTaskTrigger -AtStartup }
    'once' { New-ScheduledTaskTrigger -Once -At $time }
    default { $null }
  }
}
$aa = @{ Execute = $p.command }
if ($p.args) { $aa.Argument = $p.args }
if ($p.workdir) { $aa.WorkingDirectory = $p.workdir }
$act = New-ScheduledTaskAction @aa
$trg = MkTrigger $p.trigger

if ($p.mode -eq 'create') {
  if ($exists -and -not $p.replace) { throw 'TAREFA_EXISTE' }
  $ra = @{ TaskName = $p.name; TaskPath = $p.path; Action = $act; Force = $true }
  if ($trg) { $ra.Trigger = $trg }
  $ra.Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  if ($p.runAs -eq 'SYSTEM') {
    $ra.Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  } else {
    $level = if ($p.highest) { 'Highest' } else { 'Limited' }
    $ra.Principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel $level
  }
  Register-ScheduledTask @ra | Out-Null
} else {
  if (-not $exists) { throw 'TAREFA_NAO_EXISTE' }
  $sa = @{ TaskName = $p.name; TaskPath = $p.path; Action = $act }
  if ($trg) { $sa.Trigger = $trg }
  Set-ScheduledTask @sa | Out-Null
}
'ok'
`;

module.exports = { TASK_LIST, TASK_ACTION, TASK_SAVE };
