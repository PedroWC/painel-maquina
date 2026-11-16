# Acesso remoto

O painel escuta apenas em `127.0.0.1` ([ADR 0005](../arquitetura/adr/0005-loopback-e-tunel-ssh.md), [RN-10](../requisitos/regras-de-negocio.md#rn-10)). Para usá-lo de outro computador, **não** exponha a porta na rede: use um túnel.

## Túnel SSH (recomendado)

Na máquina de onde você quer acessar:

```bash
ssh -L 8780:127.0.0.1:8780 usuario@endereco-da-maquina
```

Mantenha a sessão aberta e acesse `http://127.0.0.1:8780` no navegador local. O tráfego vai cifrado pelo SSH. Requer o servidor OpenSSH ativo na máquina gerenciada, com autenticação por chave.

Dica: para manter o túnel sem abrir um shell, use `ssh -N -L 8780:127.0.0.1:8780 usuario@endereco-da-maquina`.

## VPN

Com uma VPN (por exemplo, WireGuard), é possível escutar no endereço da interface da VPN. Isso exige `host` apontando para esse endereço e `allowedHosts` preenchido; o painel exibirá um aviso permanente e registrará o fato na auditoria ([RN-10](../requisitos/regras-de-negocio.md#rn-10)). Prefira o túnel SSH sempre que possível.

## O que não fazer

- Não publique a porta do painel na internet nem em redirecionamento de roteador.
- Não use `host: 0.0.0.0` em rede que você não controla.
- Não compartilhe o token nem salve-o em arquivos do projeto.

## Resolução de problemas

| Sintoma | O que verificar |
|---|---|
| `Host não permitido` | Acesse por `127.0.0.1` ou `localhost`, ou inclua o nome em `allowedHosts` |
| Túnel cai | Use `ServerAliveInterval 30` no `~/.ssh/config` |
| Login bloqueado | Aguarde 5 minutos após 5 falhas ([RN-01](../requisitos/regras-de-negocio.md#rn-01)) |
