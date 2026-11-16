# 0003. node-pty e xterm.js para terminais

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O painel precisa de terminais interativos reais no navegador (cores, `Ctrl+C`, editores, redimensionamento). Processos com `stdin`/`stdout` simples não oferecem pseudo-terminal.

## Decisão
Usar `node-pty` (ConPTY no Windows) no servidor e `@xterm/xterm` com `@xterm/addon-fit` no navegador, ligados por WebSocket. As sessões ficam em memória, com cerca de 200 KB de histórico, e sobrevivem ao fechamento da aba.

## Alternativas consideradas
- `child_process.spawn` sem PTY: sem interatividade completa.
- ttyd ou GoTTY: binários externos adicionais, menos controle sobre sessões e auditoria.

## Consequências
Experiência de terminal completa e controle total das sessões. Dependência nativa (`node-pty`) e sessões perdidas se o painel reiniciar.
