# 0011. Frontend em JavaScript puro, sem etapa de build

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
A interface é um painel com poucas telas. Etapas de build e frameworks aumentam dependências e a superfície de ataque em um projeto que roda com privilégios elevados.

## Decisão
Escrever o frontend em HTML, CSS e JavaScript puros (módulos ES), servidos diretamente de `public/`. O xterm.js é servido a partir de `node_modules` por rotas explícitas. Todo texto vindo do sistema é escapado antes de ir ao DOM, e a CSP proíbe scripts inline e de outras origens.

## Alternativas consideradas
- React/Vue com bundler: produtividade em apps grandes, mas custo e dependências desproporcionais aqui.
- Web components com biblioteca: ainda uma dependência a mais sem ganho claro.

## Consequências
Sem build, sem dependências de interface além do xterm. Mais código manual para estados da tela; se a interface crescer muito, esta decisão pode ser revista em novo ADR.
