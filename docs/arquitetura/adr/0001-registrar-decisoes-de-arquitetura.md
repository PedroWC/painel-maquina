# 0001. Registrar decisões de arquitetura

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O projeto é público e terá colaboradores e mantenedores ao longo do tempo. Sem registro, o motivo das escolhas se perde e as mesmas discussões se repetem.

## Decisão
Registrar cada decisão técnica relevante em um ADR (formato MADR simplificado) em `docs/arquitetura/adr/`, numerado e datado. ADR aceito é imutável; mudanças viram um novo ADR que o substitui.

## Alternativas consideradas
- Decisões só em issues e PRs: difíceis de achar e sem estrutura.
- Wiki do GitHub: fora do repositório e sem versionamento junto do código.

## Consequências
Histórico de decisões versionado junto do código. Custa um pequeno esforço de escrita a cada decisão relevante.
