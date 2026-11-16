# Política de segurança

Este software executa ações administrativas na máquina onde roda. Levamos a segurança a sério.

## Versões com suporte

O projeto está em desenvolvimento inicial. Correções de segurança são aplicadas na versão mais recente publicada.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública** para vulnerabilidades.

Use o recurso **"Report a vulnerability"** da aba *Security* do repositório no GitHub (relatório privado). Inclua:

- descrição do problema e do impacto;
- passos para reproduzir;
- versão afetada;
- sugestão de correção, se houver.

Você receberá uma resposta de confirmação em até 7 dias. Pedimos que não divulgue o problema publicamente antes de uma correção estar disponível.

## O que está no escopo

- Autenticação, sessão e controle de acesso
- Execução de comandos e injeção (PowerShell, `sc.exe`, CLIs dos provedores)
- Terminais e WebSocket
- XSS, CSRF e DNS rebinding
- Exposição de segredos (token, cookies, `config.json`)
- Escapes dos recursos protegidos

## Modelo de ameaças e boas práticas

- Modelo de ameaças e controles: [docs/arquitetura/seguranca.md](docs/arquitetura/seguranca.md)
- Mantenha o servidor em `127.0.0.1` e use túnel SSH: [acesso remoto](docs/operacao/acesso-remoto.md)
- Guarde o token em um gerenciador de senhas e nunca o versione
- Nunca publique a porta do painel na internet

## Riscos aceitos

O terminal executa comandos arbitrários como administrador por definição: quem se autentica tem controle total da máquina. A proteção depende do sigilo do token e de restringir o acesso a loopback ou túnel.
