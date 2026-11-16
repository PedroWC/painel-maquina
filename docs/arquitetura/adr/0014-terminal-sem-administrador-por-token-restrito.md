# 0014. Terminal sem administrador por token restrito

- **Status:** aceito (complementa o [ADR 0007](0007-execucao-elevada-via-agendador.md), que continua válido)
- **Data:** 2026-11-16

## Contexto
O painel roda elevado ([ADR 0007](0007-execucao-elevada-via-agendador.md)) e, até aqui, todo terminal herdava esse privilégio. Trabalhar no dia a dia como administrador é desnecessário e perigoso; o operador precisa poder abrir um terminal **sem** administrador pelo mesmo painel.

Abrir um processo sem privilégio a partir de um processo elevado não tem uma chamada simples no Windows. O painel roda por tarefa agendada com logon S4U, sem sessão interativa, então não há `explorer.exe` do usuário para servir de pai. Além disso, o shell precisa ficar ligado ao pseudoconsole (ConPTY) criado pelo `node-pty`.

## Decisão
Quando o painel está elevado e o operador pede um terminal sem administrador, o PTY executa um PowerShell auxiliar (script estático, parâmetros por `PP_PARAMS`, [ADR 0006](0006-powershell-com-parametros-por-ambiente.md)) que:

1. cria, com `CreateRestrictedToken`, um token derivado do próprio processo com `DISABLE_MAX_PRIVILEGE | LUA_TOKEN`: os grupos de administrador passam a "somente negar" e os privilégios são removidos, como no filtro do UAC;
2. inicia o shell com `CreateProcessAsUser`, herdando o console do PTY, e espera ele terminar.

Verificado numa máquina Windows 11: `net session` falha, a gravação em `C:/Windows` recebe "Acesso negado" e `whoami /groups` mostra Administradores como "usado apenas para negar". O comportamento é coberto por um teste de sistema que roda quando o processo de teste está elevado.

## Alternativas consideradas
- **`runas /trustlevel`:** abre uma janela própria e sai; não permanece ligado ao PTY.
- **Rebaixar também a integridade para Média:** testado e descartado. Os executáveis externos iniciados pelo shell travam, pois o console do ConPTY pertence a um processo de integridade alta.
- **Tarefa agendada de nível limitado:** a saída não volta para o PTY e não há sessão interativa.
- **Iniciar o shell como filho do `explorer.exe`:** não existe em sessão sem logon interativo.

## Consequências
- O terminal sem administrador **não é idêntico ao de um usuário comum do UAC**: o nível de integridade continua alto. Para o controle de acesso (DACL, grupos e privilégios) ele se comporta como não administrador, mas objetos protegidos apenas por rótulo de integridade, sem DACL que negue, ainda podem ser alterados. Quem precisa de isolamento forte deve usar uma conta de usuário separada.
- Cada abertura compila um pequeno trecho em C# com `Add-Type`, o que leva alguns segundos.
- Se o painel não está elevado, pedir administrador é recusado e o terminal abre sem administrador.
- A escolha vai para a auditoria como `admin: true|false`; o conteúdo digitado continua fora dela.
