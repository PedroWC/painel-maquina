# Versionamento

O projeto segue [Versionamento Semântico 2.0](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`) e mantém o [CHANGELOG](../../CHANGELOG.md) no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## Regras de incremento

| Incremento | Quando | Exemplos |
|---|---|---|
| `PATCH` (0.1.**1**) | Correções compatíveis | Corrigir bloqueio de login; ajustar texto de erro |
| `MINOR` (0.**2**.0) | Funcionalidade nova compatível | Novo provedor; nova aba |
| `MAJOR` (**1**.0.0) | Mudança incompatível | Mudar formato do `config.json`; remover rota da API |

Antes da `1.0.0` o projeto está em fase inicial: mudanças incompatíveis incrementam o `MINOR`. A `1.0.0` marca a entrega de todos os requisitos de prioridade "deve" ([ERS](../requisitos/ers.md)).

O que conta como interface pública: formato do `config.json`, rotas da API, contrato dos provedores, comandos `npm run` documentados.

## Tags

Cada versão lançada recebe uma tag anotada `vMAJOR.MINOR.PATCH` na `main`. Pré-lançamentos usam o sufixo SemVer (`v0.3.0-rc.1`).

## CHANGELOG

- Mudanças da próxima versão ficam em `## [Não lançado]`, atualizadas em cada PR.
- Seções: **Adicionado**, **Alterado**, **Obsoleto**, **Removido**, **Corrigido**, **Segurança**.
- Ao lançar, o bloco `[Não lançado]` vira `## [X.Y.Z] - AAAA-MM-DD` e os links de comparação do rodapé são atualizados.

## Como lançar

1. A `main` está atualizada, limpa e com lint e testes verdes.
2. Branch `chore/N-release-vX.Y.Z`: atualizar o CHANGELOG e abrir PR (`chore(release): vX.Y.Z`).
3. Após o merge, na `main`: `npm version <patch|minor|major> -m "chore(release): v%s"` (atualiza o `package.json` e cria a tag).
4. Revisão de segurança e privacidade ([segurança](../arquitetura/seguranca.md)).
5. Publicar a tag e criar a release no GitHub com as notas do CHANGELOG.

## Compatibilidade de configuração

Mudanças no `config.json` que exijam ação do operador são incompatíveis e devem constar em **Alterado** com instruções de migração.
