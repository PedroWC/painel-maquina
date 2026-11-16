# Painel da Máquina

Painel web para gerenciar uma máquina Windows em um só lugar, com privilégios de administrador: **sessões de terminal**, **tarefas agendadas**, **serviços**, **containers** e outras tecnologias de execução (pm2, Kubernetes, Podman, WSL), detectadas automaticamente quando instaladas.

> **Status:** em desenvolvimento inicial (pré-`0.1.0`). A documentação vem antes do código e já está completa em [`docs/`](docs/README.md); as funcionalidades serão entregues por etapas e registradas no [CHANGELOG](CHANGELOG.md).

> ⚠️ **Aviso de segurança.** Este software dá controle administrativo completo da máquina a quem se autenticar nele. Use apenas em máquinas suas, mantenha o servidor em `127.0.0.1` e acesse remotamente por túnel SSH. Leia [SECURITY.md](SECURITY.md) e [segurança](docs/arquitetura/seguranca.md).

## Funcionalidades previstas

| Área | O que faz |
|---|---|
| Terminais | Abre PowerShell, cmd, Git Bash e WSL como administrador no navegador; as sessões continuam vivas ao fechar a aba |
| Tarefas agendadas | Lista, executa, para, ativa, desativa, cria, edita e exclui tarefas |
| Serviços | Lista, inicia, para, reinicia, muda o tipo de inicialização, cria, edita e exclui serviços |
| Docker | Containers (ciclo de vida e logs) e imagens |
| Processos e portas | Mostra quem usa cada porta e encerra processos |
| Provedores opcionais | pm2, Kubernetes, Docker Compose, Podman e WSL: a aba só aparece se a ferramenta estiver instalada |
| Segurança | Token (somente hash em disco), bloqueio por tentativas, escuta só em loopback, auditoria, confirmações e recursos protegidos |

## Como funciona

Um servidor Node.js roda na própria máquina (tarefa agendada elevada) e expõe uma interface web em `http://127.0.0.1:8780`. Para acessar de outro computador, use um túnel SSH ([acesso remoto](docs/operacao/acesso-remoto.md)).

## Requisitos

- Windows 10 ou 11 (x64)
- Node.js 24 (veja `.nvmrc`)
- Opcionais: Docker, pm2, kubectl, Podman, WSL

## Instalação e uso

Guia completo em [docs/operacao/instalacao.md](docs/operacao/instalacao.md). Resumo previsto:

```powershell
git clone <url-do-repositorio> painel-maquina
cd painel-maquina
npm ci
npm run gerar-token      # mostra o token uma única vez
npm start                # teste manual (use PowerShell como administrador)
.\scripts\instalar-tarefa.ps1   # execução contínua (PowerShell como administrador)
```

## Documentação

| Assunto | Onde |
|---|---|
| Índice geral | [docs/README.md](docs/README.md) |
| Requisitos e regras | [ERS](docs/requisitos/ers.md) · [regras de negócio](docs/requisitos/regras-de-negocio.md) · [rastreabilidade](docs/requisitos/rastreabilidade.md) |
| Produto | [casos de uso](docs/produto/casos-de-uso.md) · [histórias de usuário](docs/produto/historias-de-usuario.md) · [mapa do site](docs/produto/mapa-do-site.md) · [protótipos](docs/prototipos/README.md) |
| Arquitetura | [visão geral](docs/arquitetura/visao-geral.md) · [segurança](docs/arquitetura/seguranca.md) · [ADRs](docs/arquitetura/adr/README.md) |
| Processo | [git workflow](docs/processo/git-workflow.md) · [nomenclatura](docs/processo/nomenclatura.md) · [versionamento](docs/processo/versionamento.md) · [testes](docs/processo/estrategia-de-testes.md) · [definição de pronto](docs/processo/definicao-de-pronto.md) |

## Contribuindo

Leia [CONTRIBUTING.md](CONTRIBUTING.md). Resumo: branches `tipo/N-slug`, commits em Conventional Commits (PT-BR), testes para cada requisito e documentação atualizada no mesmo PR.

## Versionamento

[SemVer 2.0](https://semver.org/lang/pt-BR/). Histórico de mudanças no [CHANGELOG](CHANGELOG.md).

## Licença

[MIT](LICENSE) © 2026 Pedro Carvalhaes
