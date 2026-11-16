# 0010. Ferramentas externas via CLI com `execFile`

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
Docker, pm2, kubectl, Podman e WSL têm CLIs estáveis e conhecidas pelo operador. Integrar por sockets ou APIs próprias exigiria clientes específicos e mais dependências.

## Decisão
Integrar cada tecnologia pela sua CLI, usando `execFile` com array de argumentos (sem shell), saída em JSON quando disponível, tempo limite por chamada e uma allowlist de operações por provedor ([RN-12](../../requisitos/regras-de-negocio.md#rn-12)). Identificadores recebidos do cliente são validados antes de virarem argumentos.

## Alternativas consideradas
- API do Docker pelo named pipe e API do Kubernetes: mais código e mais dependências.
- `child_process.exec` com string de comando: risco de injeção.

## Consequências
Comportamento idêntico ao que o operador conhece da linha de comando. Depende da CLI estar no `PATH` do processo do painel e do formato de saída dela.
