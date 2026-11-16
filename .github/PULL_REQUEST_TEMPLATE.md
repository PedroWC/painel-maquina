## O que muda

<!-- Resumo claro da mudança e do motivo. -->

## Requisitos afetados

<!-- IDs: RF-, RNF-, RN-, UC-, US-, ADR -->

## Como testar

<!-- Passos para verificar. -->

## Checklist (definição de pronto)

- [ ] Título do PR no padrão Conventional Commits (`tipo(escopo): descrição`)
- [ ] Branch no padrão `<tipo>/<issue>-<slug>`
- [ ] Testes escritos (ID no nome) e passando; testes de segurança nas rotas novas
- [ ] `npm run lint` e `npm test` verdes; cobertura sem queda
- [ ] Documentação atualizada (ERS, regras, casos de uso, histórias, mapa do site, protótipos)
- [ ] ADR criado, se houve decisão arquitetural
- [ ] Rastreabilidade e CHANGELOG atualizados
- [ ] Sem segredos, tokens, `config.json`, `audit.log`, caminhos de usuário, IPs reais ou e-mails pessoais no diff
- [ ] Processos externos só com `execFile` (sem shell); entradas validadas
