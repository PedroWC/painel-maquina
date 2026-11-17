# Especificação de Requisitos de Software (ERS)

Versão do documento: 1.0 · Escopo: Painel da Máquina

## 1. Introdução

### 1.1 Propósito

Definir os requisitos funcionais e não funcionais do Painel da Máquina, um sistema web que permite ao administrador de uma máquina Windows gerenciar, de um só lugar, sessões de terminal, tarefas agendadas, serviços, containers e outras tecnologias de execução (pm2, Kubernetes e semelhantes).

### 1.2 Escopo

O sistema roda na própria máquina gerenciada, de forma contínua e com privilégios de administrador, e expõe uma interface web acessada pelo navegador. Não faz parte do escopo: gerenciar outras máquinas, multiusuário com perfis distintos, ou hospedar aplicações de terceiros.

### 1.3 Definições

| Termo | Significado |
|---|---|
| Painel | O sistema descrito neste documento |
| Provedor | Módulo que integra uma tecnologia opcional (Docker, pm2, Kubernetes etc.) por meio de um contrato comum |
| Sessão de terminal | Shell executado no servidor e acessível pelo navegador |
| Recurso protegido | Item que o painel não pode parar ou excluir (ver [RN-03](regras-de-negocio.md#rn-03), [RN-04](regras-de-negocio.md#rn-04), [RN-09](regras-de-negocio.md#rn-09)) |
| Operador | Pessoa autenticada que usa o painel |

### 1.4 Convenções

IDs são estáveis: `RF-` (funcional), `RNF-` (não funcional), `RN-` (regra de negócio), `UC-` (caso de uso), `US-` (história de usuário). Prioridade segue MoSCoW: **M** (deve), **S** (deveria), **C** (poderia). Itens aposentados são marcados como "Obsoleto", nunca renumerados.

Documentos relacionados: [regras de negócio](regras-de-negocio.md), [rastreabilidade](rastreabilidade.md), [casos de uso](../produto/casos-de-uso.md), [histórias de usuário](../produto/historias-de-usuario.md).

## 2. Visão geral

- **Perfil do usuário:** um único operador, administrador da máquina, autenticado por token.
- **Ambiente:** Windows 10/11 x64, Node.js 24, navegador moderno. Docker, pm2, kubectl, Podman e WSL são opcionais.
- **Restrições:** servidor escuta apenas em loopback por padrão; acesso remoto por túnel SSH ([ADR 0005](../arquitetura/adr/0005-loopback-e-tunel-ssh.md)).

## 3. Requisitos funcionais

### 3.1 Acesso

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-01 | O sistema deve autenticar o operador por token e iniciar uma sessão web | M | UC-01 |
| RF-02 | O sistema deve permitir encerrar a sessão (logout) e expirar sessões inativas conforme [RN-02](regras-de-negocio.md#rn-02) | M | UC-02 |

### 3.2 Terminais

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-03 | Criar sessão de terminal escolhendo shell (PowerShell, cmd, Git Bash, WSL), pasta inicial, nome e se terá permissão de administrador ([RN-18](regras-de-negocio.md#rn-18)) | M | UC-03 |
| RF-04 | Listar sessões de terminal com nome, shell, estado, PID e privilégio | M | UC-04 |
| RF-05 | Reanexar-se a uma sessão existente recebendo o histórico recente (scrollback), mesmo após fechar a aba | M | UC-04 |
| RF-06 | Renomear e encerrar sessões de terminal | M | UC-04 |

### 3.3 Tarefas agendadas

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-07 | Listar e filtrar tarefas agendadas, com estado, gatilhos, próxima e última execução, e resultado | M | UC-05 |
| RF-08 | Executar e parar uma tarefa | M | UC-05 |
| RF-09 | Ativar e desativar uma tarefa | M | UC-05 |
| RF-10 | Criar, editar e excluir tarefas (comando, argumentos, pasta, gatilho, conta de execução) | M | UC-06, UC-07 |

### 3.4 Serviços do Windows

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-11 | Listar serviços com nome, estado, tipo de inicialização, conta e caminho | M | UC-08 |
| RF-12 | Iniciar, parar e reiniciar um serviço | M | UC-08 |
| RF-13 | Alterar o tipo de inicialização (automático, manual, desativado) | M | UC-08 |
| RF-14 | Criar, editar e excluir serviços | S | UC-09 |

### 3.5 Docker, processos e portas

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-15 | Containers Docker: listar, iniciar, parar, reiniciar, remover e ver logs | M | UC-10 |
| RF-16 | Imagens Docker: listar e remover | S | UC-10 |
| RF-17 | Listar processos e portas em escuta, e encerrar um processo | M | UC-11 |

### 3.6 Provedores opcionais

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-18 | Provedor Docker Compose: listar projetos e serviços; subir, parar, reiniciar e ver logs | C | UC-12 |
| RF-19 | Provedor pm2: listar processos; iniciar, parar, reiniciar, excluir e ver logs | S | UC-12 |
| RF-20 | Provedor Kubernetes: listar contextos, namespaces, pods, deployments e services; reiniciar rollout, escalar, excluir e ver logs | S | UC-12 |
| RF-21 | Provedor Podman: listar containers e imagens; iniciar, parar, reiniciar, remover e ver logs | C | UC-12 |
| RF-22 | Provedor WSL: listar distribuições; encerrar distribuição, encerrar o WSL e abrir terminal em uma distribuição | S | UC-12 |
| RF-23 | Detectar automaticamente quais provedores estão instalados, repetir a detecção periodicamente e exibir o status de cada um | M | UC-13 |

### 3.7 Transversais

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-24 | Registrar em auditoria toda ação que altera estado (quem, quando, o quê, resultado) | M | todos |
| RF-25 | Impedir que recursos protegidos sejam parados, desativados ou excluídos | M | UC-05, UC-08, UC-11 |
| RF-26 | Atualizar periodicamente as listagens da aba ativa e permitir atualização manual | S | todos |
| RF-27 | Exigir confirmação explícita antes de ações destrutivas | M | todos |

### 3.8 Monitor de recursos

| ID | Requisito | Prioridade | Casos de uso |
|---|---|---|---|
| RF-28 | Mostrar o uso geral de CPU, memória (RAM) e GPU da máquina, com a memória de vídeo e, quando houver `nvidia-smi`, a temperatura da GPU | M | UC-14 |
| RF-29 | Oferecer a visão **resumo** (totais, consumo do Windows e dos programas, maiores consumidores) e a visão **detalhada** (todos os processos, com filtro e ordenação), separando o consumo do Windows (nativo) do dos programas não nativos ([RN-19](regras-de-negocio.md#rn-19)) | M | UC-14 |
| RF-30 | Permitir escolher o intervalo de atualização (tempo real, 30 segundos, 1 minuto ou 5 minutos), pausar e atualizar na hora; a atualização para sozinha com a aba em segundo plano | M | UC-14 |
| RF-31 | Encerrar processos pelo monitor, com confirmação (digitando o nome, se for do Windows) e as proteções de [RN-04](regras-de-negocio.md#rn-04) e [RN-20](regras-de-negocio.md#rn-20) | M | UC-14 |

## 4. Requisitos não funcionais

| ID | Categoria | Requisito |
|---|---|---|
| RNF-01 | Segurança de acesso | O servidor escuta somente em loopback por padrão; toda rota de dados exige sessão; `Origin` e `Host` são verificados; CSP restritiva; limite de tentativas de login |
| RNF-02 | Desempenho | Listagens respondem em até 3 s em condições normais; o terminal não deve introduzir latência perceptível |
| RNF-03 | Disponibilidade | O painel inicia com o Windows, sem ninguém conectado, e volta sozinho em até 2 minutos se o processo cair ou for encerrado ([ADR 0013](../arquitetura/adr/0013-vigia-periodico-para-manter-o-painel-ativo.md)) |
| RNF-04 | Compatibilidade | Windows 10/11 x64; Node.js 24; navegadores atuais (Chromium, Firefox) |
| RNF-05 | Usabilidade | Interface em PT-BR, responsiva, com feedback de sucesso e erro para cada ação |
| RNF-06 | Manutenibilidade | Cobertura de testes mínima de 80% no núcleo; lint sem erros; módulos pequenos e injetáveis |
| RNF-07 | Observabilidade | Auditoria em JSON Lines; logs nunca contêm token, cookie ou hash |
| RNF-08 | Portabilidade de configuração | Host, porta e parâmetros de segurança vêm de arquivo de configuração local ou variáveis de ambiente |
| RNF-09 | Privacidade e segredos | Nenhum segredo no repositório; o token é armazenado apenas como hash |
| RNF-10 | Extensibilidade | Novas tecnologias entram como provedores que seguem um contrato comum, sem alterar o núcleo |
| RNF-11 | Acessibilidade | Contraste adequado, navegação por teclado nos controles principais e rótulos nos campos |
| RNF-12 | Custo do monitoramento | O monitor só consome recursos enquanto alguém o consulta: o amostrador para após 2 minutos sem leituras; leituras seguintes levam dezenas de milissegundos ([ADR 0015](../arquitetura/adr/0015-amostrador-persistente-para-o-monitor-de-recursos.md)) |

## 5. Interfaces externas

- **Navegador:** HTTP e WebSocket em `http://127.0.0.1:8780` (padrão).
- **Sistema:** PowerShell (tarefas, serviços, processos e o amostrador do monitor), `sc.exe`, `docker`, `pm2`, `kubectl`, `podman`, `wsl` e, opcionalmente, `nvidia-smi`, sempre via `execFile` ([RN-12](regras-de-negocio.md#rn-12)).
- **Armazenamento:** `config.json` (configuração local) e `audit.log` (auditoria).

## 6. Fora do escopo

Multiusuário e perfis; gerenciamento remoto de várias máquinas; terminais em máquinas de terceiros; backup e restauração; execução como Linux/macOS.
