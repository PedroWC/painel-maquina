# Nomenclatura

## Branches

Formato: `<tipo>/<issue>-<slug>`

- **tipo:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `hotfix`
- **issue:** número da issue (ou da referência da mudança)
- **slug:** kebab-case, minúsculas, sem acentos, até 50 caracteres

| Tipo | Quando usar | Exemplo |
|---|---|---|
| `feat` | Nova funcionalidade | `feat/12-sessoes-de-terminal` |
| `fix` | Correção de defeito | `fix/31-bloqueio-de-login` |
| `docs` | Somente documentação | `docs/1-documentacao-inicial` |
| `refactor` | Reestruturação sem mudar comportamento | `refactor/40-isolar-powershell` |
| `test` | Somente testes | `test/45-cobertura-de-protecoes` |
| `chore` | Manutenção, dependências, configuração | `chore/2-estrutura-inicial` |
| `ci` | Pipeline e automações | `ci/50-varredura-de-segredos` |
| `perf` | Melhoria de desempenho | `perf/55-cache-de-listagens` |
| `hotfix` | Correção urgente em versão lançada | `hotfix/60-falha-no-logout` |

Branches de release usam `chore/N-release-vX.Y.Z`.

## Commits

Formato: `tipo(escopo): descrição`

- **tipo:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `style`, `revert`
- **escopo** (opcional, kebab-case): `auth`, `terminais`, `tarefas`, `servicos`, `docker`, `provedores`, `processos`, `auditoria`, `docs`, `deps`
- **descrição:** PT-BR, imperativo, minúscula inicial, sem ponto final, até 100 caracteres no total da primeira linha

```
feat(terminais): permite reanexar sessões após fechar a aba
fix(auth): bloqueia login após cinco tentativas inválidas
docs(requisitos): adiciona regras de negócio dos provedores
test(servicos): cobre RN-09 de serviços críticos protegidos
chore(deps): atualiza ws para a última versão de correção
feat(provedores)!: muda o contrato de detect()

BREAKING CHANGE: detect() agora retorna um objeto em vez de booleano.
```

## Tags e versões

`vMAJOR.MINOR.PATCH`, por exemplo `v0.2.0`. Detalhes em [versionamento](versionamento.md).

## Código

- Identificadores (variáveis, funções, arquivos) em **inglês**; textos para o usuário, mensagens de erro, documentação e commits em **PT-BR**.
- Arquivos e pastas: `kebab-case` (`rate-limit.js`). Funções e variáveis: `camelCase`. Constantes: `UPPER_SNAKE_CASE`. Classes: `PascalCase`.
- Rotas da API em inglês e minúsculas (`/api/tasks`); abas e telas em PT-BR.

## Identificadores da documentação

| Prefixo | Significado | Documento |
|---|---|---|
| `RF-nn` | Requisito funcional | [ERS](../requisitos/ers.md) |
| `RNF-nn` | Requisito não funcional | [ERS](../requisitos/ers.md) |
| `RN-nn` | Regra de negócio | [regras de negócio](../requisitos/regras-de-negocio.md) |
| `UC-nn` | Caso de uso | [casos de uso](../produto/casos-de-uso.md) |
| `US-nn` | História de usuário | [histórias](../produto/historias-de-usuario.md) |
| `NNNN` | ADR | [ADRs](../arquitetura/adr/README.md) |

IDs nunca são reutilizados nem renumerados; itens aposentados são marcados como "Obsoleto".

## Recursos de teste no sistema

Recursos criados por testes que tocam o sistema real usam o prefixo `PainelTeste_` (por exemplo, `PainelTeste_tarefa1`) e são sempre removidos ao final.
