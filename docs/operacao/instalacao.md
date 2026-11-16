# Instalação e operação

> O painel ainda está em desenvolvimento. Este guia descreve o procedimento previsto; comandos e scripts serão entregues junto das funcionalidades correspondentes (veja o [CHANGELOG](../../CHANGELOG.md)).

## Requisitos

- Windows 10 ou 11 (x64)
- [Node.js 24](https://nodejs.org/) (versão em `.nvmrc`)
- PowerShell 5.1 ou superior (já incluído no Windows)
- Opcionais, detectados automaticamente: Docker, pm2, kubectl, Podman, WSL ([ADR 0012](../arquitetura/adr/0012-provedores-opcionais-com-deteccao.md))

## Instalação

```powershell
git clone <url-do-repositorio> painel-maquina
cd painel-maquina
npm ci
npm run gerar-token
```

`npm run gerar-token` cria o `config.json` e mostra o token **uma única vez**. Guarde-o em um gerenciador de senhas. O arquivo guarda só o hash ([RN-16](../requisitos/regras-de-negocio.md#rn-16)) e **não deve ser versionado**.

## Execução manual (teste)

```powershell
# PowerShell como administrador, para que os terminais e as ações tenham privilégio
npm start
```

Abra `http://127.0.0.1:8780` e entre com o token. Sem privilégio de administrador o painel funciona, mas as ações que exigem elevação falham e os terminais não são "admin".

## Execução contínua (recomendado)

Em um PowerShell **como administrador**, na pasta do projeto:

```powershell
.\scripts\instalar-tarefa.ps1
```

O script registra a tarefa `PainelMaquina` ([ADR 0007](../arquitetura/adr/0007-execucao-elevada-via-agendador.md)): inicia com o Windows, usa o nível de execução mais alto, reinicia em caso de falha e roda sem janela. O painel protege essa tarefa ([RN-03](../requisitos/regras-de-negocio.md#rn-03)).

Para remover:

```powershell
.\scripts\desinstalar-tarefa.ps1
```

## Configuração

Veja os campos em [visão geral](../arquitetura/visao-geral.md#configuração). Após editar o `config.json`, reinicie a tarefa:

```powershell
Stop-ScheduledTask -TaskName PainelMaquina; Start-ScheduledTask -TaskName PainelMaquina
```

## Trocar o token

```powershell
npm run gerar-token
```

Gera um novo token e substitui o hash anterior. Todas as sessões ativas deixam de valer ao reiniciar o painel.

## Auditoria e logs

As ações que alteram estado são gravadas em `audit.log` (JSON Lines), nunca com token, cookie ou texto digitado em terminais ([RN-06](../requisitos/regras-de-negocio.md#rn-06)). O arquivo não é versionado.

## Atualização

```powershell
git pull
npm ci
Stop-ScheduledTask -TaskName PainelMaquina; Start-ScheduledTask -TaskName PainelMaquina
```

Leia o [CHANGELOG](../../CHANGELOG.md) antes: mudanças incompatíveis trazem instruções de migração.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Porta em uso | Outro programa usa a 8780 | Altere `port` no `config.json` |
| Terminais não abrem | Falha na dependência nativa | Rode `npm ci` com a versão de Node do `.nvmrc` |
| Aba de uma ferramenta não aparece | Ferramenta não instalada ou fora do `PATH` do processo | Instale e use "Detectar novamente" em Provedores |
| Mensagem `AttachConsole failed` no console ao encerrar um terminal | Ruído do `node-pty` ao fechar o ConPTY; os processos da sessão são finalizados normalmente | Pode ser ignorada |
| "Acesso negado" em tarefas ou serviços | Painel sem privilégio de administrador | Instale pela tarefa elevada |
