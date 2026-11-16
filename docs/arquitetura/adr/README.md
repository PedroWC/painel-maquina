# Registros de decisão arquitetural (ADR)

Cada decisão técnica relevante vira um ADR no formato [MADR](https://adr.github.io/madr/) simplificado. **Um ADR aceito não é editado**: para mudar uma decisão, cria-se um novo ADR que a substitui e o antigo passa a "substituído por".

Para criar um novo, copie o modelo abaixo e use o próximo número livre.

| Nº | Decisão | Status |
|---|---|---|
| [0001](0001-registrar-decisoes-de-arquitetura.md) | Registrar decisões de arquitetura | aceito |
| [0002](0002-nodejs-com-dependencias-minimas.md) | Node.js com dependências mínimas | aceito |
| [0003](0003-node-pty-e-xterm.md) | node-pty e xterm.js para terminais | aceito |
| [0004](0004-token-e-cookie-de-sessao.md) | Autenticação por token e cookie de sessão | aceito |
| [0005](0005-loopback-e-tunel-ssh.md) | Loopback por padrão e acesso remoto por túnel SSH | aceito |
| [0006](0006-powershell-com-parametros-por-ambiente.md) | PowerShell com `-EncodedCommand` e parâmetros por ambiente | aceito |
| [0007](0007-execucao-elevada-via-agendador.md) | Execução elevada pelo Agendador de Tarefas | aceito |
| [0008](0008-github-flow-conventional-commits-semver.md) | GitHub Flow, Conventional Commits e SemVer | aceito |
| [0009](0009-higiene-de-segredos-e-metadados.md) | Higiene de segredos e metadados do repositório | aceito |
| [0010](0010-ferramentas-via-cli-com-execfile.md) | Ferramentas externas via CLI com `execFile` | aceito |
| [0011](0011-frontend-vanilla-sem-build.md) | Frontend em JavaScript puro, sem etapa de build | aceito |
| [0012](0012-provedores-opcionais-com-deteccao.md) | Provedores opcionais com detecção em tempo de execução | aceito |
| [0013](0013-vigia-periodico-para-manter-o-painel-ativo.md) | Vigia periódico para manter o painel ativo | aceito (complementa o 0007) |

## Modelo

```markdown
# NNNN. Título da decisão

- **Status:** proposto | aceito | substituído por [ADR NNNN](NNNN-...md)
- **Data:** AAAA-MM-DD

## Contexto
## Decisão
## Alternativas consideradas
## Consequências
```
