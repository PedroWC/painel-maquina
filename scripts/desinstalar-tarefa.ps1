<#
.SYNOPSIS
    Remove a tarefa agendada do Painel da Máquina.

.DESCRIPTION
    Para o painel (se estiver em execução) e remove a tarefa. Não apaga o
    config.json, o audit.log nem o painel.log. Precisa ser executado em um
    PowerShell como administrador.

.PARAMETER Nome
    Nome da tarefa (padrão: PainelMaquina).

.EXAMPLE
    .\scripts\desinstalar-tarefa.ps1
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.-]{1,100}$')]
    [string]$Nome = 'PainelMaquina'
)

$ErrorActionPreference = 'Stop'

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalAtual = [Security.Principal.WindowsPrincipal]$identidade
if (-not $principalAtual.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute este script em um PowerShell como administrador.'
}

$tarefa = Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue
if (-not $tarefa) {
    Write-Host "A tarefa '$Nome' não existe. Nada a remover."
    return
}

if ($tarefa.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $Nome
    Write-Host "Painel parado."
}
Unregister-ScheduledTask -TaskName $Nome -Confirm:$false
Write-Host "Tarefa '$Nome' removida."
Write-Host 'Os arquivos config.json, audit.log e painel.log foram mantidos.'
