# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Documentação inicial: requisitos (ERS), regras de negócio, casos de uso, histórias de usuário, mapa do site, protótipos, ADRs, segurança, processo de desenvolvimento e operação.
- `README`, `CONTRIBUTING`, `SECURITY` e licença MIT.
- Autenticação por token com sessão de 12 h e bloqueio por tentativas (RF-01, RF-02, RN-01, RN-02, RN-16), geração de token com `npm run gerar-token` (somente o hash fica em disco).
- Núcleo de segurança: verificação de `Host` e `Origin`, `X-Requested-With`, cookie `HttpOnly`/`SameSite=Strict`, CSP e demais cabeçalhos, limite de corpo, validação de entradas, recursos protegidos, auditoria em JSON Lines e configuração com escuta apenas em loopback (RNF-01, RN-10, RN-17).
- Interface mínima de login e logout.
- Estrutura do projeto: `package.json` (Node 24), ESLint, executor de testes nativo com cobertura, `config.example.json` e integração contínua (lint, testes, auditoria, varredura de segredos e validação do título do PR).
