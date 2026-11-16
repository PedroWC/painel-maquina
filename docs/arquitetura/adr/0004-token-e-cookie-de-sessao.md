# 0004. Autenticação por token e cookie de sessão

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O sistema dá acesso administrativo à máquina e tem um único operador. Senhas e contas multiusuário aumentariam a complexidade sem benefício.

## Decisão
Autenticar com um token aleatório de alta entropia, criado pelo comando `npm run gerar-token` e exibido uma única vez. O arquivo de configuração guarda somente o hash (scrypt). O login troca o token por um cookie de sessão `HttpOnly` e `SameSite=Strict`, válido por 12 horas. A comparação usa `timingSafeEqual`. Há bloqueio de 5 minutos após 5 falhas por endereço.

## Alternativas consideradas
- Usuário e senha: exige política de senha e recuperação, sem ganho para um operador único.
- Autenticação do Windows: acopla ao domínio e complica o uso por túnel.
- Autenticação por proxy externo: dependência a mais para instalar e manter.

## Consequências
Fluxo simples e seguro para um operador. Perder o token exige gerar outro. Sessões ficam em memória e se perdem ao reiniciar o painel.
