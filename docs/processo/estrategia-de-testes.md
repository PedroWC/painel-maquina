# Estratégia de testes

Rastreabilidade de cada requisito e regra para seus testes em [rastreabilidade](../requisitos/rastreabilidade.md).

## Ferramentas

- Executor: `node:test` e `node:assert/strict` (nativos do Node.js).
- Cobertura: `node --test --experimental-test-coverage`; mínimo de **80%** no núcleo (`src/`), verificado no CI.
- Lint: ESLint. Formatação: `.editorconfig`.

Comandos: `npm test`, `npm run test:cov`, `npm run lint`.

## Pirâmide

| Nível | Local | O que cobre | Dependências externas |
|---|---|---|---|
| Unitário | `tests/unit/` | Validação, autenticação, rate limit, configuração, auditoria, proteções, contrato e detecção dos provedores, cada provedor | Simuladas (mocks) |
| Integração | `tests/integration/` | Servidor em porta efêmera: rotas, 401/403/400, cabeçalhos, WebSocket, fluxo de terminais | PowerShell e CLIs simulados por injeção |
| Sistema (`windows`) | `tests/integration/*.windows.test.js` | Leituras e operações reais em recursos temporários `PainelTeste_*` | Reais, apenas no CI `windows-latest` ou sob demanda local |
| Roteiro manual | `tests/e2e/smoke.md` | Fluxos de interface, confirmações, atualização periódica, reinício do PC | Máquina real |

## Convenções

1. O ID do requisito ou regra aparece no nome do teste: `RN-03: não permite excluir a tarefa do próprio painel`.
2. Todo RF e toda RN tem pelo menos um teste (ou item no roteiro manual quando for de interface).
3. Toda rota nova tem testes de segurança: sem cookie (**401**), `Host` ou `Origin` inválidos (**403**), entrada inválida (**400**).
4. Provedores têm sempre os casos: ferramenta ausente (rota 404 e aba oculta), presente, falha, tempo esgotado e ação fora da allowlist.
5. Testes de sistema só criam, alteram e removem recursos com o prefixo `PainelTeste_` e limpam em `after`/`finally`. Nunca tocam em recursos que não criaram.
6. Dados de teste são genéricos e determinísticos; sem dependência de relógio ou rede.

## Estrutura

```
tests/
├── unit/            auth, config, audit, validate, rate-limit, protections, providers/*
├── integration/     auth, terminals, tasks, services, processes, security (+ *.windows.test.js)
├── helpers/         servidor de teste, executores simulados
└── e2e/             smoke.md (roteiro manual)
```

## Roteiro de smoke (manual)

Executado antes de cada release, em `tests/e2e/smoke.md`: login e bloqueio, abrir e reanexar terminal, ciclo de vida de uma tarefa e de um serviço de teste, containers, confirmações por nome, atualização periódica, proteções, reinício do PC, acesso por túnel.

## CI

GitHub Actions em `windows-latest` com Node 24: instalação limpa (`npm ci`), lint, testes com cobertura, varredura de segredos e `npm audit --omit=dev`. O PR só pode ser integrado com o CI verde.
