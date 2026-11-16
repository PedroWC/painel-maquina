# Como contribuir

Obrigado pelo interesse! Este projeto controla uma máquina com privilégios de administrador, então o processo prioriza **clareza, testes e segurança**.

## Antes de começar

1. Leia o [README](README.md) e o [índice da documentação](docs/README.md).
2. Procure uma issue existente ou abra uma nova descrevendo o problema ou a proposta e os requisitos afetados (`RF-`, `RN-`).
3. Para mudanças grandes ou de arquitetura, discuta na issue antes de codar; elas geram um [ADR](docs/arquitetura/adr/README.md).

**Vulnerabilidades:** não abra issue pública. Siga o [SECURITY.md](SECURITY.md).

## Ambiente

```powershell
git clone <url-do-seu-fork> painel-maquina
cd painel-maquina
npm ci
npm test
```

Requer Windows 10/11 e Node.js 24 (`.nvmrc`). Testes unitários e de integração usam simulações e **não alteram sua máquina**. Testes marcados `windows` criam apenas recursos temporários `PainelTeste_*` e os removem ao final.

## Fluxo

Resumo (detalhes em [git workflow](docs/processo/git-workflow.md)):

1. Crie uma branch a partir da `main` atualizada: `<tipo>/<issue>-<slug>` (ex.: `feat/12-sessoes-de-terminal`). Veja [nomenclatura](docs/processo/nomenclatura.md).
2. **Documente primeiro:** atualize requisitos, regras, casos de uso, histórias, mapa do site e protótipos afetados.
3. **Escreva testes** com o ID do requisito no nome (ex.: `RN-03: ...`) e depois o código.
4. Rode `npm run lint` e `npm test`.
5. Atualize a [rastreabilidade](docs/requisitos/rastreabilidade.md) e o [CHANGELOG](CHANGELOG.md) (`[Não lançado]`).
6. Faça commits no padrão Conventional Commits em PT-BR.
7. Abra o Pull Request usando o modelo. O CI precisa passar.

## Commits

```
tipo(escopo): descrição no imperativo
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `style`, `revert`. Exemplos em [nomenclatura](docs/processo/nomenclatura.md).

## Regras de código

- Identificadores em inglês; textos para o usuário, erros, documentação e commits em PT-BR.
- Processos externos **somente** com `execFile` e array de argumentos (sem shell). PowerShell com scripts estáticos e parâmetros por variável de ambiente ([ADR 0006](docs/arquitetura/adr/0006-powershell-com-parametros-por-ambiente.md)).
- Toda entrada do cliente é validada ([RN-17](docs/requisitos/regras-de-negocio.md#rn-17)).
- Toda rota nova tem testes de segurança: 401, 403 e 400.
- Novas tecnologias entram como **provedores** ([ADR 0012](docs/arquitetura/adr/0012-provedores-opcionais-com-deteccao.md)).

## Dados sensíveis

Nunca inclua em commits, issues ou PRs: tokens, `config.json`, `audit.log`, chaves, caminhos de usuário, IPs reais ou e-mails pessoais. Use nomes genéricos nos exemplos (`MinhaTarefa`, `meu-servico`).

## Definição de pronto

Veja [definição de pronto](docs/processo/definicao-de-pronto.md).

## Licença

Ao contribuir, você concorda que sua contribuição será licenciada sob a [MIT](LICENSE).
