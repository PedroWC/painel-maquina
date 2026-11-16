# Segurança e modelo de ameaças

O painel dá acesso administrativo completo à máquina. Por isso a segurança é requisito central ([RNF-01](../requisitos/ers.md), [RNF-09](../requisitos/ers.md)). Para reportar vulnerabilidades, veja [SECURITY.md](../../SECURITY.md).

## Ativos protegidos

- Execução de comandos como administrador (terminais, tarefas, serviços, processos).
- Token de acesso e sessões.
- Controle de containers e clusters.
- Integridade do próprio painel (tarefa e processo).

## Ameaças e controles

| # | Ameaça | Controle | Referência |
|---|---|---|---|
| T1 | Acesso de rede não autorizado | Escuta só em loopback; acesso remoto por túnel SSH | ADR 0005, RN-10 |
| T2 | Adivinhação do token | Token aleatório de alta entropia; bloqueio após 5 falhas por 5 min | ADR 0004, RN-01 |
| T3 | Vazamento do token | Só o hash fica em disco; exibido uma vez; nunca em logs | RN-16, RNF-07 |
| T4 | Roubo ou reutilização de sessão | Cookie `HttpOnly`, `SameSite=Strict`, expiração de 12 h, logout invalida | RN-02 |
| T5 | CSRF | `SameSite=Strict`, cabeçalho `X-Requested-With`, checagem de `Origin` | RNF-01 |
| T6 | DNS rebinding | Verificação do cabeçalho `Host` contra lista permitida | ADR 0005 |
| T7 | Injeção de comandos | Scripts PowerShell estáticos; `execFile` com array de argumentos; allowlist de operações; validação de entrada | ADR 0006, ADR 0010, RN-12, RN-17 |
| T8 | XSS na interface | Todo texto vindo do sistema é escapado; CSP sem scripts inline | ADR 0011 |
| T9 | WebSocket sequestrado | Validação de sessão e `Origin` no upgrade | RNF-01 |
| T10 | Autodestruição acidental | Recursos protegidos; confirmação por nome para ações destrutivas | RN-03, RN-04, RN-05, RN-09 |
| T11 | Falha de um provedor derrubar o painel | Tempo limite e isolamento por provedor | RN-14 |
| T12 | Esgotamento de recursos | Limite de 20 sessões de terminal; histórico de 200 KB por sessão; limite de corpo das requisições | RN-15 |
| T13 | Segredos ou dados pessoais publicados | `.gitignore`, hash do token, varredura de segredos no CI, revisão antes de publicar | ADR 0009 |
| T14 | Dependência comprometida | Poucas dependências; `package-lock.json`; `npm audit` e Dependabot | ADR 0002 |
| T15 | Escalada via terminal | O terminal é sinalizado como "admin" ou "sem admin" e auditado (abertura com o privilégio escolhido e encerramento, sem o conteúdo digitado); abrir sem administrador usa token restrito, e a integridade do processo continua alta (limites no ADR 0014) | RN-07, RN-18, RN-06 |
| T16 | Curingas em nomes (`*`, `?`, `[ ]`) fazendo um comando atingir vários serviços ou tarefas | Validação recusa curingas; scripts operam sobre o objeto exato (`Where-Object -eq` e `-InputObject`) e recusam resultado ambíguo | RN-17, ADR 0006 |
| T17 | Segredos ou dados sensíveis em `painel.log` | O log só espelha o console (início, parada, avisos e erros genéricos); o painel nunca imprime token, cookies, hash nem o texto digitado; o arquivo não é versionado | RNF-07, RNF-09 |
| T19 | Encerrar, pelo monitor, um processo crítico do Windows e derrubar o sistema | Lista de processos críticos conferida **no servidor, pelo nome**, antes de encerrar (a interface só desabilita o botão); outros processos do Windows exigem digitar o nome; recusas e encerramentos são auditados | RN-20, RN-04 |
| T20 | Monitor consumindo a máquina ou clique no processo errado numa tabela que se reordena | Um amostrador compartilhado com cache, parado após 2 minutos sem uso; tabela parada enquanto o ponteiro está sobre ela e durante diálogos; confirmação sempre mostra nome e PID | RN-21, RNF-12 |
| T18 | Ação no cluster ou contexto errado do Kubernetes | O banner e os seletores mostram sempre o contexto e o namespace; cada comando leva o contexto e o namespace explícitos (o kubeconfig nunca é alterado); excluir, escalar e reiniciar rollout exigem digitar o nome do recurso, conferido no servidor; ids restritos a pod, deployment e service | RN-13, RN-12 |

## Cabeçalhos e políticas

- `Content-Security-Policy`: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:` (sem `script-src` de outras origens).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` nas respostas da API.

## Riscos aceitos

- O terminal é, por definição, execução arbitrária de comandos como administrador: quem autentica tem controle total da máquina. A proteção depende do sigilo do token e do acesso apenas por loopback ou túnel.
- Sessões em memória: reiniciar o painel desloga o operador e encerra os terminais.
- Tráfego em HTTP simples no loopback; em acesso remoto, a confidencialidade vem do túnel SSH.

## Checklist antes de publicar

Resumo do que a revisão de segurança verifica: nenhum segredo ou dado pessoal versionado, autor correto nos commits, ausência de `exec` com shell, rotas autenticadas, bind em loopback, `npm audit` sem altas e críticas, varredura de segredos limpa em todo o histórico.
