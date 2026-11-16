# Instalação e operação

## Requisitos

- Windows 10 ou 11 (x64)
- [Node.js 24](https://nodejs.org/) (versão em `.nvmrc`)
- PowerShell 5.1 ou superior (já incluído no Windows)
- Opcionais, detectados automaticamente: Docker, pm2, kubectl, Podman, WSL ([ADR 0012](../arquitetura/adr/0012-provedores-opcionais-com-deteccao.md))

## Instalação

```powershell
git clone https://github.com/PedroWC/painel-maquina.git painel-maquina
cd painel-maquina
npm ci
npm run gerar-token
```

`npm run gerar-token` cria o `config.json` e mostra o token **uma única vez**. Guarde-o em um gerenciador de senhas. O arquivo guarda só o hash ([RN-16](../requisitos/regras-de-negocio.md#rn-16)), tem permissões restritas ao seu usuário, ao SYSTEM e aos Administradores, e **não deve ser versionado**.

## Execução manual (teste)

```powershell
# PowerShell como administrador, para que os terminais e as ações tenham privilégio
npm start
```

Abra `http://127.0.0.1:8780` e entre com o token. Sem privilégio de administrador o painel funciona, mas as ações que exigem elevação falham e os terminais não são "admin".

## Execução contínua (recomendado)

Em um PowerShell **como administrador** (botão direito, "Executar como administrador"), na pasta do projeto:

```powershell
.\scripts\instalar-tarefa.ps1 -IniciarAgora
```

O script confere os pré-requisitos (administrador, `npm ci`, Node.js e `config.json` com token) e registra a tarefa `PainelMaquina` ([ADR 0007](../arquitetura/adr/0007-execucao-elevada-via-agendador.md), [ADR 0013](../arquitetura/adr/0013-vigia-periodico-para-manter-o-painel-ativo.md)):

| Propriedade | Valor |
|---|---|
| Conta | O usuário que executou o script, com logon **S4U**: não pede nem guarda senha |
| Privilégio | Nível de execução mais alto (administrador), sem pedir confirmação do UAC |
| Início | 30 segundos depois da inicialização do Windows, mesmo sem ninguém conectado |
| Vigia | A cada 2 minutos tenta iniciar a tarefa; se o painel já está rodando não faz nada, se tiver caído sobe de novo |
| Janela | Nenhuma |
| Instâncias | Uma só (`IgnoreNew`) |

O painel protege essa tarefa: ele não consegue pará-la, desativá-la, editá-la nem excluí-la ([RN-03](../requisitos/regras-de-negocio.md#rn-03)). Reinstalar com o mesmo comando **atualiza** a tarefa, sem duplicá-la.

O script aceita `-Nome` para usar outro nome de tarefa (por exemplo, para testes). Só o nome padrão, `PainelMaquina`, recebe a proteção acima.

### Conferir

```powershell
Get-ScheduledTask -TaskName PainelMaquina | Get-ScheduledTaskInfo   # estado e último resultado
Get-Content .\painel.log -Tail 20                                   # o que o painel registrou
```

Abra `http://127.0.0.1:8780`: o selo "administrador" deve aparecer no topo. Para validar o início automático, reinicie o computador, espere cerca de um minuto e abra o endereço de novo.

### Remover

```powershell
.\scripts\desinstalar-tarefa.ps1
```

Para o painel e remove a tarefa. **Não apaga** o `config.json`, o `audit.log` nem o `painel.log`.

## Configuração

Veja os campos em [visão geral](../arquitetura/visao-geral.md#configuração). Após editar o `config.json`, reinicie a tarefa:

```powershell
Stop-ScheduledTask -TaskName PainelMaquina; Start-ScheduledTask -TaskName PainelMaquina
```

## Trocar o token

```powershell
npm run gerar-token
```

Gera um novo token e substitui o hash anterior. Reinicie o painel (comando acima): todas as sessões ativas deixam de valer.

## Auditoria e logs

- `audit.log` (JSON Lines): ações que alteram estado, incluindo recusas por proteção. Nunca contém token, cookie ou texto digitado em terminais ([RN-06](../requisitos/regras-de-negocio.md#rn-06)).
- `painel.log`: o que o painel imprimiria no console (início, parada, avisos e erros), com data e nível. É útil porque a tarefa roda sem janela. Fica limitado a 5 MB: ao passar disso, o arquivo anterior vira `painel.log.1` e um novo é iniciado. Defina `PAINEL_LOG=0` para desligar.

Nenhum dos dois é versionado.

## Atualização

```powershell
git pull
npm ci
Stop-ScheduledTask -TaskName PainelMaquina; Start-ScheduledTask -TaskName PainelMaquina
```

Leia o [CHANGELOG](../../CHANGELOG.md) antes: mudanças incompatíveis trazem instruções de migração. Se uma versão alterar a tarefa, rode `.\scripts\instalar-tarefa.ps1` de novo.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| O instalador diz "Execute este script em um PowerShell como administrador" | O PowerShell não está elevado | Abra como administrador |
| O instalador diz "config.json não encontrado" ou "sem token" | O token ainda não foi gerado | Rode `npm run gerar-token` |
| O instalador diz "Dependências não instaladas" ou "Node.js não encontrado" | Falta `npm ci` ou o Node.js no `PATH` | Rode `npm ci`; instale o Node.js 24 |
| A tarefa existe, mas o endereço não abre | O painel ainda está iniciando (30 s de atraso na inicialização) ou a porta está em uso | Espere; consulte `painel.log`; use `Start-ScheduledTask -TaskName PainelMaquina` |
| Porta em uso | Outro programa usa a 8780 | Altere `port` no `config.json` e reinicie a tarefa |
| O painel parou e voltou sozinho | O vigia o reiniciou (no máximo em 2 minutos) | Veja o motivo da queda no `painel.log` |
| Terminais não abrem | Falha na dependência nativa | Rode `npm ci` com a versão de Node do `.nvmrc` |
| Aba de uma ferramenta não aparece | Ferramenta não instalada ou fora do `PATH` do processo | Instale e use "Detectar novamente" em Provedores. Na tarefa (S4U) só vale o `PATH` do sistema, não o do usuário |
| A aba do pm2 não aparece, mas o pm2 está instalado | O pm2 foi instalado em uma pasta fora do `PATH` do sistema (na tarefa agendada vale só o `PATH` do sistema) | Informe o caminho de `node_modules\pm2\bin\pm2` em `pm2Entry` no `config.json`, reinicie a tarefa e use "Detectar novamente" |
| A aba do pm2 diz que o daemon não está em execução | Nenhum processo foi iniciado com o pm2 nesta conta | Inicie algo com `pm2 start`; o painel não inicia o daemon sozinho |
| Mensagem `AttachConsole failed` no console ao encerrar um terminal | Ruído do `node-pty` ao fechar o ConPTY; os processos da sessão são finalizados normalmente | Pode ser ignorada |
| Aba Docker mostra "o motor não está respondendo" | O Docker está instalado, mas o Docker Desktop (motor) não está em execução | Inicie o Docker Desktop e clique em Atualizar |
| "Acesso negado" em tarefas ou serviços | Painel sem privilégio de administrador | Instale pela tarefa elevada |
