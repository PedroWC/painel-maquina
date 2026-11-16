# 0008. GitHub Flow, Conventional Commits e SemVer

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O repositório será público e precisa de histórico legível, releases previsíveis e um processo simples para um mantenedor principal e eventuais colaboradores.

## Decisão
- **Fluxo:** GitHub Flow. `main` protegida e sempre estável; mudanças em branches curtas `<tipo>/<issue>-<slug>`, integradas por PR com squash.
- **Commits:** Conventional Commits em PT-BR (`tipo(escopo): descrição`).
- **Versões:** SemVer 2.0 com tags `vX.Y.Z`; CHANGELOG no formato Keep a Changelog.

Detalhes em [git workflow](../../processo/git-workflow.md), [nomenclatura](../../processo/nomenclatura.md) e [versionamento](../../processo/versionamento.md).

## Alternativas consideradas
- Git Flow (develop e release branches): cerimônia desnecessária para este porte.
- Trunk-based com commits diretos: sem revisão nem CI antes de integrar.

## Consequências
Histórico linear e legível; changelog e versão derivados dos commits. Exige disciplina no título dos PRs.
