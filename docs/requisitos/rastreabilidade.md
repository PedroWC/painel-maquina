# Matriz de rastreabilidade

Liga cada requisito e regra a casos de uso, histórias de usuário e testes. **Mantenha esta matriz atualizada a cada mudança** (regra do projeto).

Legenda de status: `planejado` (teste ainda não escrito), `implementado` (teste existe e passa), `parcial` (regra testada em módulo, ainda sem integração nas rotas da funcionalidade).

O nome de cada teste inclui o ID que ele cobre, por exemplo `RN-03: não permite excluir a tarefa do próprio painel`.

## Requisitos funcionais

| ID | Caso de uso | História | Teste (arquivo) | Status |
|---|---|---|---|---|
| RF-01 | UC-01 | US-01 | `tests/integration/auth.test.js`, `tests/unit/auth.test.js` | implementado |
| RF-02 | UC-02 | US-02 | `tests/integration/auth.test.js`, `tests/unit/auth.test.js` | implementado |
| RF-03 | UC-03 | US-03 | `tests/unit/terminals.test.js`, `tests/integration/terminals.test.js`, `tests/integration/terminals.windows.test.js` | implementado |
| RF-04 | UC-04 | US-04 | `tests/unit/terminals.test.js`, `tests/integration/terminals.test.js` | implementado |
| RF-05 | UC-04 | US-04 | `tests/unit/terminals.test.js`, `tests/integration/terminals.test.js` | implementado |
| RF-06 | UC-04 | US-04 | `tests/unit/terminals.test.js`, `tests/integration/terminals.test.js` | implementado |
| RF-07 | UC-05 | US-05 | `tests/integration/tasks.test.js` | planejado |
| RF-08 | UC-05 | US-05 | `tests/integration/tasks.test.js` | planejado |
| RF-09 | UC-05 | US-05 | `tests/integration/tasks.test.js` | planejado |
| RF-10 | UC-06, UC-07 | US-06, US-07 | `tests/integration/tasks.test.js` | planejado |
| RF-11 | UC-08 | US-08 | `tests/integration/services.test.js` | planejado |
| RF-12 | UC-08 | US-08 | `tests/integration/services.test.js` | planejado |
| RF-13 | UC-08 | US-08 | `tests/integration/services.test.js` | planejado |
| RF-14 | UC-09 | US-09 | `tests/integration/services.test.js` | planejado |
| RF-15 | UC-10 | US-10 | `tests/unit/providers/docker.test.js` | planejado |
| RF-16 | UC-10 | US-10 | `tests/unit/providers/docker.test.js` | planejado |
| RF-17 | UC-11 | US-11 | `tests/integration/processes.test.js` | planejado |
| RF-18 | UC-12 | US-12 | `tests/unit/providers/compose.test.js` | planejado |
| RF-19 | UC-12 | US-12 | `tests/unit/providers/pm2.test.js` | planejado |
| RF-20 | UC-12 | US-12 | `tests/unit/providers/kubernetes.test.js` | planejado |
| RF-21 | UC-12 | US-12 | `tests/unit/providers/podman.test.js` | planejado |
| RF-22 | UC-12 | US-12 | `tests/unit/providers/wsl.test.js` | planejado |
| RF-23 | UC-13 | US-13 | `tests/unit/providers/registry.test.js` | planejado |
| RF-24 | todos | US-14 | `tests/unit/audit.test.js`, `tests/integration/auth.test.js` | parcial |
| RF-25 | UC-05, UC-08, UC-11 | US-15 | `tests/unit/protections.test.js` | parcial |
| RF-26 | todos | US-16 | `tests/e2e/smoke.md` (roteiro manual) | planejado |
| RF-27 | todos | US-17 | `tests/e2e/smoke.md` (roteiro manual) | planejado |

## Regras de negócio

| ID | Teste (arquivo) | Status |
|---|---|---|
| RN-01 | `tests/unit/auth.test.js`, `tests/integration/auth.test.js` | implementado |
| RN-02 | `tests/unit/auth.test.js`, `tests/unit/security.test.js` | implementado |
| RN-03 | `tests/unit/protections.test.js` | parcial |
| RN-04 | `tests/unit/protections.test.js` | parcial |
| RN-05 | `tests/e2e/smoke.md` (roteiro manual) | planejado |
| RN-06 | `tests/unit/audit.test.js`, `tests/integration/auth.test.js` | parcial |
| RN-07 | `tests/unit/terminals.test.js`, `tests/integration/terminals.test.js` | implementado |
| RN-08 | `tests/integration/tasks.test.js` | planejado |
| RN-09 | `tests/unit/protections.test.js` | parcial |
| RN-10 | `tests/unit/config.test.js` | implementado |
| RN-11 | `tests/unit/providers/registry.test.js` | planejado |
| RN-12 | `tests/unit/providers/base.test.js` | planejado |
| RN-13 | `tests/unit/providers/kubernetes.test.js` | planejado |
| RN-14 | `tests/unit/providers/registry.test.js` | planejado |
| RN-15 | `tests/unit/terminals.test.js`, `tests/integration/terminals.test.js` | implementado |
| RN-16 | `tests/unit/auth.test.js`, `tests/unit/config.test.js` | implementado |
| RN-17 | `tests/unit/validate.test.js` | parcial |

## Requisitos não funcionais

| ID | Verificação |
|---|---|
| RNF-01 | Implementado: `tests/integration/security.test.js` e `tests/unit/security.test.js` (401, 403, 413, path traversal, cabeçalhos, Host e Origin). Rotas futuras repetem os testes de segurança |
| RNF-02 | Verificação manual com cronômetro no roteiro de smoke |
| RNF-03 | Verificação manual: reinício do PC e queda do processo (ver [instalação](../operacao/instalacao.md)) |
| RNF-04 | CI em `windows-latest` com Node 24 |
| RNF-05 | Revisão dos protótipos e do roteiro de smoke |
| RNF-06 | `npm run test:cov` com limite mínimo; `npm run lint` no CI |
| RNF-07 | Implementado: `tests/unit/audit.test.js` (ausência de segredos nos registros) |
| RNF-08 | Implementado: `tests/unit/config.test.js` |
| RNF-09 | gitleaks no CI e `tests/unit/config.test.js` |
| RNF-10 | `tests/unit/providers/registry.test.js` |
| RNF-11 | Revisão manual de contraste e teclado no roteiro de smoke |
