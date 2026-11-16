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
- Processos e portas: listar por uso de memória e por porta em escuta com o processo dono, e encerrar processos; o processo do painel, os shells dos terminais e os processos de sistema (PID 0 a 4) são protegidos (RF-17, RF-25, RN-04).
- Auditoria das tentativas recusadas por proteção ou limite (RN-03, RN-06).
- Framework de provedores opcionais (ADR 0012): contrato comum, detecção em tempo de execução com repetição periódica, abas geradas dinamicamente, tempo limite e isolamento de falhas, allowlist de operações e confirmação pelo nome quando exigida (RF-23, RN-11 a RN-14, RNF-10).
- Provedor Docker: containers (iniciar, parar, reiniciar, remover e logs) e imagens (remover), com mensagem amigável quando o motor está parado (RF-15, RF-16).
- Aba Provedores com o status de cada tecnologia e botão para detectar novamente.
- Instalador da tarefa elevada: `scripts/instalar-tarefa.ps1` e `scripts/desinstalar-tarefa.ps1`. A tarefa inicia o painel com o Windows, como administrador, sem janela e sem guardar senha (logon S4U), e um vigia a cada 2 minutos o sobe de novo se ele cair (ADR 0007 e 0013; RNF-03).
- `painel.log`: o que o painel imprimiria no console passa também para um arquivo, com rotação em 5 MB.
- Roteiro de smoke manual (`tests/e2e/smoke.md`).
- Provedor pm2: listar processos (estado, CPU, memória, reinícios e tempo ativo), iniciar, reiniciar, parar, excluir e ver logs. O pm2 é executado pelo `node` com o script `bin/pm2` (sem shell), localizado por `pm2Entry`, `PAINEL_PM2_ENTRY`, `where` ou pastas usuais; detectar e listar não iniciam o daemon; o processo do próprio painel é protegido (RF-19, RN-04).
- Opção de configuração `pm2Entry`.
- Estrutura do projeto: `package.json` (Node 24), ESLint, executor de testes nativo com cobertura, `config.example.json` e integração contínua (lint, testes, auditoria, varredura de segredos e validação do título do PR).
