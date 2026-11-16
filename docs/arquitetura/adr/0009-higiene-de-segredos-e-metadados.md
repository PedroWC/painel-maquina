# 0009. Higiene de segredos e metadados do repositório

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O repositório é público e o sistema controla uma máquina com privilégios de administrador. Um segredo ou um dado pessoal publicado por engano não pode ser realmente desfeito, pois o histórico do Git é copiado por quem clonar.

## Decisão
- **Segredos fora do Git:** `config.json`, `.env*`, `audit.log` e chaves ficam no `.gitignore`. O repositório só traz `config.example.json`, com valores de exemplo.
- **Token como hash:** o token só existe em claro no momento da geração; o `config.json` guarda apenas o hash scrypt ([ADR 0004](0004-token-e-cookie-de-sessao.md)) e tem permissões restritas ao usuário, SYSTEM e Administradores.
- **Identidade pública dos commits:** o autor é configurado por repositório (`user.name` e `user.email` locais), usando um e-mail próprio para o projeto e nunca um e-mail pessoal de uso geral.
- **Dados genéricos na documentação:** exemplos usam nomes como `MinhaTarefa` e `meu-servico`, sem caminhos de usuário, IPs reais ou nomes de projetos pessoais.
- **Verificações automáticas:** varredura de segredos (gitleaks) e `npm audit` no CI; checagem local antes de qualquer publicação.
- **Ganchos locais:** validação do formato das mensagens de commit por um hook local, que não é versionado.

## Alternativas consideradas
- Confiar só em revisão manual: falha silenciosa, sem barreira técnica.
- Guardar segredos criptografados no repositório: aumenta a superfície sem necessidade, pois cada instalação gera o próprio token.

## Consequências
Reduz o risco de vazamento e deixa o processo auditável. Cada clone precisa gerar o próprio `config.json` com `npm run gerar-token`.
