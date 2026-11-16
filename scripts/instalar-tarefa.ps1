<#
.SYNOPSIS
    Instala o Painel da Máquina como tarefa agendada elevada (ADR 0007).

.DESCRIPTION
    Registra uma tarefa que inicia o painel com o Windows, com privilégios de
    administrador, sem janela e sem pedir senha (logon S4U). Um gatilho de vigia,
    a cada 2 minutos, sobe o painel de novo se ele tiver parado. Precisa ser
    executado em um PowerShell como administrador.

    Pré-requisitos: `npm ci` executado e `npm run gerar-token` já rodado
    (o config.json precisa existir com o hash do token).

.PARAMETER Nome
    Nome da tarefa. O padrão (PainelMaquina) é o nome que o painel protege contra
    parada, desativação, edição e exclusão (RN-03).

.PARAMETER IniciarAgora
    Inicia a tarefa logo após registrá-la.

.EXAMPLE
    .\scripts\instalar-tarefa.ps1 -IniciarAgora
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_.-]{1,100}$')]
    [string]$Nome = 'PainelMaquina',

    [switch]$IniciarAgora
)

$ErrorActionPreference = 'Stop'

# 1) Precisa ser administrador.
$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalAtual = [Security.Principal.WindowsPrincipal]$identidade
if (-not $principalAtual.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute este script em um PowerShell como administrador (clique com o botão direito e escolha "Executar como administrador").'
}

# 2) Confere o projeto, o Node.js e a configuração.
$raiz = Split-Path -Parent $PSScriptRoot
$entrada = Join-Path $raiz 'src\main.js'
$configuracao = Join-Path $raiz 'config.json'

if (-not (Test-Path -LiteralPath $entrada)) { throw "Arquivo de entrada não encontrado: $entrada" }
if (-not (Test-Path -LiteralPath (Join-Path $raiz 'node_modules'))) { throw 'Dependências não instaladas. Execute: npm ci' }

$comandoNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $comandoNode) { throw 'Node.js não encontrado no PATH. Instale o Node.js 24 (veja .nvmrc).' }
$node = $comandoNode.Source

if (-not (Test-Path -LiteralPath $configuracao)) {
    throw "config.json não encontrado. Execute antes: npm run gerar-token"
}
$config = Get-Content -LiteralPath $configuracao -Raw | ConvertFrom-Json
if (-not $config.tokenHash) { throw 'O config.json não tem token configurado. Execute: npm run gerar-token' }

# 3) Monta a tarefa: inicia com o Windows, nível mais alto, S4U (sem senha armazenada), sem janela.
$acao = New-ScheduledTaskAction -Execute $node -Argument ('"{0}"' -f $entrada) -WorkingDirectory $raiz

$gatilhoInicio = New-ScheduledTaskTrigger -AtStartup
$gatilhoInicio.Delay = 'PT30S'   # dá tempo para a rede e outros serviços subirem

# Vigia: a cada 2 minutos o Agendador tenta iniciar a tarefa; com MultipleInstances IgnoreNew isso
# não faz nada se o painel já está rodando e o sobe de novo se ele tiver caído ou sido encerrado.
# (A opção "reiniciar em caso de falha" sozinha não cobre um processo encerrado à força; ADR 0013.)
$gatilhoVigia = New-ScheduledTaskTrigger -Once -At ([datetime]::Today) `
    -RepetitionInterval (New-TimeSpan -Minutes 2)   # sem -RepetitionDuration: repete indefinidamente (MaxValue é recusado)

$usuario = '{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Highest

$configuracoes = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$jaExistia = [bool](Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue)
Register-ScheduledTask `
    -TaskName $Nome `
    -Description 'Painel da Máquina: servidor web local (somente loopback) para gerenciar terminais, tarefas, serviços e containers.' `
    -Action $acao `
    -Trigger @($gatilhoInicio, $gatilhoVigia) `
    -Principal $principal `
    -Settings $configuracoes `
    -Force | Out-Null

Write-Host ''
if ($jaExistia) { Write-Host "Tarefa '$Nome' atualizada." } else { Write-Host "Tarefa '$Nome' criada." }
Write-Host "  Usuário:   $usuario (logon S4U, nível mais alto, sem janela)"
Write-Host '  Inicia:    30 segundos após a inicialização do Windows'
Write-Host '  Vigia:     a cada 2 minutos confere o painel e o inicia se tiver parado'
Write-Host "  Endereço:  http://$($config.host):$($config.port)"
Write-Host "  Log:       $(Join-Path $raiz 'painel.log')"

if ($IniciarAgora) {
    Start-ScheduledTask -TaskName $Nome
    Write-Host ''
    Write-Host "Tarefa iniciada. Abra http://$($config.host):$($config.port) em instantes."
} else {
    Write-Host ''
    Write-Host "Para iniciar agora: Start-ScheduledTask -TaskName $Nome"
}
Write-Host "Para remover:       .\scripts\desinstalar-tarefa.ps1"
