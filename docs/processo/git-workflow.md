# Fluxo de trabalho com Git

Decisão registrada no [ADR 0008](../arquitetura/adr/0008-github-flow-conventional-commits-semver.md). Nomes de branches e commits em [nomenclatura](nomenclatura.md).

## Resumo

- `main` é protegida e sempre estável. **Ninguém commita direto nela.**
- Toda melhoria ou correção nasce em uma branch curta a partir da `main` atualizada.
- A integração é feita por Pull Request com **squash merge**; o título do PR vira o commit na `main`.
- Releases são tags `vX.Y.Z` na `main` ([versionamento](versionamento.md)).

```mermaid
gitGraph
  commit id: "chore: inicializa"
  branch feat/12-sessoes-de-terminal
  checkout feat/12-sessoes-de-terminal
  commit id: "test(terminais): ..."
  commit id: "feat(terminais): ..."
  checkout main
  merge feat/12-sessoes-de-terminal id: "feat(terminais): ... (#12)" tag: "v0.2.0"
```

## Passo a passo

1. **Issue.** Toda mudança tem uma issue (ou um número de referência) descrevendo o problema e os IDs afetados (`RF-`, `RN-`).
2. **Branch.**
   ```
   git switch main
   git pull --ff-only
   git switch -c feat/12-sessoes-de-terminal
   ```
3. **Documentar primeiro.** Atualize requisitos, regras, casos de uso, histórias, mapa do site e protótipos. Decisão arquitetural nova gera um [ADR](../arquitetura/adr/README.md).
4. **Testes e código.** Escreva os testes (com o ID no nome) e depois a implementação.
5. **Verificar localmente:** `npm run lint` e `npm test`.
6. **Commits pequenos e coesos**, no padrão Conventional Commits.
7. **Pull Request** para a `main`, usando o modelo em `.github/PULL_REQUEST_TEMPLATE.md`. O CI precisa passar (lint, testes, varredura de segredos, `npm audit`).
8. **Squash merge** e remoção da branch.

## Proteção da `main` (configurar no GitHub)

- Exigir Pull Request antes de integrar.
- Exigir que o CI passe.
- Exigir branch atualizada com a `main`.
- Bloquear push forçado e exclusão da branch.
- Histórico linear (somente squash).

## Commits

Formato: `tipo(escopo): descrição` em PT-BR, no imperativo, até 100 caracteres. Veja exemplos e tipos em [nomenclatura](nomenclatura.md). Corpo opcional explica o porquê. Rodapé opcional: `Refs: #12`. Mudança incompatível: `!` após o escopo e `BREAKING CHANGE:` no rodapé.

## Correções urgentes (`hotfix/`)

Para um defeito grave em versão já lançada: `hotfix/N-slug` a partir da `main`, correção mínima com teste, PR com prioridade, nova versão PATCH.

## Dados sensíveis

Antes de abrir PR, revise `git diff --staged`: nada de `config.json`, tokens, `audit.log`, caminhos de usuário, IPs reais ou e-mails pessoais. O repositório usa identidade de autor configurada localmente ([ADR 0009](../arquitetura/adr/0009-higiene-de-segredos-e-metadados.md)).
