# Definição de pronto

Uma mudança só é integrada na `main` quando **todos** os itens se aplicam.

## Requisitos e documentação

- [ ] A mudança está ligada a um ou mais IDs (`RF-`, `RNF-`, `RN-`, `UC-`, `US-`); se não existiam, foram criados antes
- [ ] ERS, regras de negócio, casos de uso, histórias, mapa do site e protótipos atualizados quando afetados
- [ ] ADR criado quando houve decisão arquitetural
- [ ] [Rastreabilidade](../requisitos/rastreabilidade.md) atualizada
- [ ] README atualizado se mudou algo visível ao usuário
- [ ] CHANGELOG com entrada em `[Não lançado]`

## Qualidade

- [ ] Testes escritos, com o ID no nome, e passando
- [ ] Testes de segurança nas rotas novas (401, 403, 400)
- [ ] Cobertura do núcleo ≥ 80% e sem queda
- [ ] `npm run lint` sem erros
- [ ] CI verde

## Segurança e privacidade

- [ ] Nenhum segredo, token, `config.json` ou `audit.log` no diff
- [ ] Nenhum caminho de usuário, IP real, e-mail pessoal ou nome de projeto pessoal em código, docs ou exemplos
- [ ] Sem `shell: true`/`exec`; entradas validadas; allowlists respeitadas
- [ ] Rotas que alteram estado: sessão, `X-Requested-With`, `Origin` válido e auditoria
- [ ] Recursos protegidos continuam protegidos

## Git

- [ ] Branch no padrão `<tipo>/<issue>-<slug>`
- [ ] Commits no padrão Conventional Commits, em PT-BR
- [ ] Título do PR no padrão; descrição com contexto, IDs afetados e como testar
- [ ] Squash merge e branch removida

## Para releases

- [ ] CHANGELOG da versão fechado com a data
- [ ] Roteiro de smoke manual executado
- [ ] Revisão de segurança e privacidade concluída
- [ ] Tag `vX.Y.Z` criada
