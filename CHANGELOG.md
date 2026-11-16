# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Segurança
- Nomes de tarefas e serviços com curingas (`*`, `?`, `[ ]`) são recusados e os scripts operam sobre o objeto exato, evitando que um comando atinja vários recursos.

### Adicionado
- Documentação inicial: requisitos (ERS), regras de negócio, casos de uso, histórias de usuário, mapa do site, protótipos, ADRs, segurança, processo de desenvolvimento e operação.
- `README`, `CONTRIBUTING`, `SECURITY` e licença MIT.
- Autenticação por token com sessão de 12 h e bloqueio por tentativas (RF-01, RF-02, RN-01, RN-02, RN-16), geração de token com `npm run gerar-token` (somente o hash fica em disco).
- Núcleo de segurança: verificação de `Host` e `Origin`, `X-Requested-With`, cookie `HttpOnly`/`SameSite=Strict`, CSP e demais cabeçalhos, limite de corpo, validação de entradas, recursos protegidos, auditoria em JSON Lines e configuração com escuta apenas em loopback (RNF-01, RN-10, RN-17).
- Interface mínima de login e logout.
- Sessões de terminal como administrador no navegador (PowerShell, cmd, Git Bash e WSL): criar, listar, renomear, encerrar e reanexar com histórico, limite de 20 sessões, fluxo por WebSocket protegido por sessão, `Origin` e `Host` (RF-03 a RF-06, RN-07, RN-15).
- Tarefas agendadas: listar e filtrar (tarefas do Windows ocultas por padrão), executar, parar, ativar, desativar, criar (diário, semanal, logon, inicialização, uma vez ou manual; conta do sistema ou do usuário), editar e excluir com confirmação pelo nome; a tarefa do próprio painel é protegida (RF-07 a RF-10, RN-03, RN-05, RN-08).
- Executor de PowerShell com scripts estáticos e parâmetros por variável de ambiente (ADR 0006).
- Interface: componentes de tabela e diálogos reutilizáveis e aba Tarefas.
- Serviços do Windows: listar e filtrar, iniciar, parar, reiniciar, alterar a inicialização, criar, editar e excluir; 25 serviços críticos protegidos, confirmação pelo nome para excluir e para operações que derrubariam o `sshd` (RF-11 a RF-14, RN-05, RN-09).
- Estrutura do projeto: `package.json` (Node 24), ESLint, executor de testes nativo com cobertura, `config.example.json` e integração contínua (lint, testes, auditoria, varredura de segredos e validação do título do PR).
