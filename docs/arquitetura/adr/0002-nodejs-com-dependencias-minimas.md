# 0002. Node.js com dependências mínimas

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O painel roda com privilégios de administrador. Cada dependência é superfície de ataque e de manutenção. Node.js 24 já traz servidor HTTP, `crypto`, `child_process` e um executor de testes nativos.

## Decisão
Usar Node.js 24 com o servidor `http` nativo e `node:test`. Dependências de execução limitadas a: `ws` (WebSocket), `node-pty` (terminais) e, no navegador, `@xterm/xterm` e `@xterm/addon-fit`. Sem framework web.

## Alternativas consideradas
- Express/Fastify: ergonomia melhor, mas mais dependências em um processo elevado.
- Python (FastAPI): bom para scripts de sistema, mas o ecossistema de terminal no navegador (xterm.js + node-pty) é mais direto em Node.

## Consequências
Menos dependências para auditar e atualizar. Roteamento e validação são escritos à mão e precisam de testes. `node-pty` tem módulo nativo (há binários pré-compilados para Windows x64).
