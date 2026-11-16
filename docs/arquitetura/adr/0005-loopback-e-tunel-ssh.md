# 0005. Loopback por padrão e acesso remoto por túnel SSH

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
Um painel com terminal administrativo exposto na rede seria um alvo de altíssimo valor. O usuário já acessa a máquina por SSH.

## Decisão
O servidor escuta apenas em `127.0.0.1` (porta padrão 8780). O acesso remoto é feito por túnel SSH (`ssh -L 8780:127.0.0.1:8780 usuario@maquina`) ou por Remote Control. Escutar em outro endereço exige `allowedHosts` preenchido e mostra aviso permanente ([RN-10](../../requisitos/regras-de-negocio.md#rn-10)). O servidor também verifica o cabeçalho `Host` contra DNS rebinding.

## Alternativas consideradas
- Escutar em `0.0.0.0` com HTTPS próprio: exige gestão de certificados e amplia a exposição.
- VPN (Tailscale/WireGuard): boa opção, mas é uma dependência externa; compatível com esta decisão (continua em loopback ou na interface da VPN via `allowedHosts`).

## Consequências
Superfície de ataque mínima por padrão. O acesso remoto exige um passo extra (túnel).
