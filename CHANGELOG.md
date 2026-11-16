# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Terminal com ou sem administrador: caixa "Administrador" ao abrir a sessão (marcada por padrão); sem ela, o shell abre com token restrito, a sessão aparece como "sem admin" e a escolha é auditada (RF-03, RN-07, RN-18, ADR 0014).
- A API de terminais aceita `admin` e informa `panelAdmin`.

## [0.1.0] - 2026-11-16

Primeira versão. O painel gerencia terminais, tarefas agendadas, serviços, processos e portas de uma máquina Windows e, quando instaladas, tecnologias opcionais (Docker, Docker Compose, Podman, pm2, Kubernetes e WSL). Como o projeto está antes da `1.0.0`, mudanças incompatíveis futuras incrementam o `MINOR` ([versionamento](docs/processo/versionamento.md)).

### Adicionado

**Acesso e segurança**
- Autenticação por token com sessão de 12 h e bloqueio por tentativas; o token é gerado por `npm run gerar-token` e somente o hash fica em disco (RF-01, RF-02, RN-01, RN-02, RN-16).
- Núcleo de segurança: verificação de `Host` e `Origin`, `X-Requested-With`, cookie `HttpOnly`/`SameSite=Strict`, CSP e demais cabeçalhos, limite de corpo, validação de entradas, recursos protegidos, auditoria em JSON Lines e escuta apenas em loopback por padrão (RNF-01, RN-10, RN-17).
- Auditoria das tentativas recusadas por proteção ou limite (RN-03, RN-06).
- Interface web com login, logout e abas por área.

**Terminais** (RF-03 a RF-06, RF-22, RN-07, RN-15)
- Sessões de terminal como administrador no navegador (PowerShell, cmd, Git Bash e WSL): criar, listar, renomear, encerrar e reanexar com histórico, limite de 20 sessões e fluxo por WebSocket protegido por sessão, `Origin` e `Host`.
- Abertura de terminal em uma distribuição específica do WSL (`wsl.exe -d`).

**Tarefas agendadas** (RF-07 a RF-10, RN-03, RN-05, RN-08)
- Listar e filtrar (tarefas do Windows ocultas por padrão), executar, parar, ativar, desativar, criar (diário, semanal, logon, inicialização, uma vez ou manual; conta do sistema ou do usuário), editar e excluir com confirmação pelo nome. A tarefa do próprio painel é protegida.
- Executor de PowerShell com scripts estáticos e parâmetros por variável de ambiente (ADR 0006).

**Serviços do Windows** (RF-11 a RF-14, RN-05, RN-09)
- Listar e filtrar, iniciar, parar, reiniciar, alterar a inicialização, criar, editar e excluir. 25 serviços críticos são protegidos, e excluir (ou operações que derrubariam o `sshd`) exige digitar o nome.

**Processos e portas** (RF-17, RF-25, RN-04)
- Listar por uso de memória e por porta em escuta com o processo dono, e encerrar processos. O processo do painel, os shells dos terminais e os processos de sistema (PID 0 a 4) são protegidos.

**Provedores opcionais** (ADR 0012; RF-15, RF-16, RF-18 a RF-23, RN-11 a RN-14, RNF-10)
- Framework: contrato comum, detecção em tempo de execução com repetição periódica, abas geradas dinamicamente, tempo limite e isolamento de falhas, lista de operações permitidas, seletores genéricos, parâmetros de consulta, aviso não fatal, campos de formulário nas ações e confirmação pelo nome quando exigida. Aba Provedores com o status de cada tecnologia.
- **Docker** e **Podman** (sobre um motor de containers compartilhado): containers (iniciar, parar, reiniciar, remover e logs) e imagens (remover), com mensagem amigável quando o motor ou a máquina do Podman está parado.
- **Docker Compose**: projetos e serviços, subir (sem construir imagens), parar e reiniciar o projeto, e logs do projeto ou de um serviço. Nada é removido.
- **pm2**: processos (estado, CPU, memória, reinícios e tempo ativo), iniciar, reiniciar, parar, excluir e logs. Executado pelo `node` com o script `bin/pm2`, sem shell; detectar e listar não iniciam o daemon. Opção de configuração `pm2Entry`.
- **Kubernetes**: contextos e namespaces em seletores, deployments, pods e services; reiniciar rollout, escalar, excluir e logs. O contexto e o namespace ativos ficam sempre visíveis, vão explícitos em cada comando (o kubeconfig nunca é alterado) e as operações que alteram o cluster exigem digitar o nome do recurso.
- **WSL**: distribuições (versão, padrão e estado), encerrar uma distribuição e desligar o WSL (confirmação digitando `wsl`). A saída UTF-16 e traduzida do `wsl.exe` é decodificada e interpretada sem depender do idioma; o executor de CLIs aceita `encoding: 'auto'`.

**Instalação e operação** (ADR 0007 e 0013; RNF-03)
- `scripts/instalar-tarefa.ps1` e `scripts/desinstalar-tarefa.ps1`: a tarefa inicia o painel com o Windows, como administrador, sem janela e sem guardar senha (logon S4U), e um vigia a cada 2 minutos o sobe de novo se ele cair.
- `painel.log`: o que o painel imprimiria no console passa também para um arquivo, com rotação em 5 MB.

**Documentação e processo**
- Requisitos (ERS), regras de negócio, casos de uso, histórias de usuário, mapa do site, protótipos, 13 ADRs, modelo de ameaças, rastreabilidade, processo de desenvolvimento e operação, e o roteiro de smoke manual (`tests/e2e/smoke.md`).
- `README`, `CONTRIBUTING`, `SECURITY` e licença MIT.
- Integração contínua (lint, testes, auditoria, varredura de segredos e validação do título do PR), Dependabot e modelos de PR e issues.

### Segurança

- Nomes de tarefas e serviços com curingas (`*`, `?`, `[ ]`) são recusados e os scripts operam sobre o objeto exato, evitando que um comando atinja vários recursos.
- Nenhum processo externo é executado por shell: apenas `execFile` com argumentos validados e lista de operações permitidas por provedor.

[Não lançado]: https://github.com/PedroWC/painel-maquina/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/PedroWC/painel-maquina/releases/tag/v0.1.0
