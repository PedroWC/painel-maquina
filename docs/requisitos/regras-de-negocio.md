# Regras de negócio

As regras abaixo valem para todo o sistema. Cada uma é verificada por testes (ver [rastreabilidade](rastreabilidade.md)). Requisitos em [ERS](ers.md).

<a id="rn-01"></a>
## RN-01 · Bloqueio por tentativas de login

Após **5 falhas** consecutivas de login vindas do mesmo endereço, novas tentativas são recusadas por **5 minutos**, mesmo com token correto. Um login bem-sucedido zera o contador. Relacionado: RF-01, RNF-01.

<a id="rn-02"></a>
## RN-02 · Expiração de sessão

A sessão web expira **12 horas** após o login. Depois disso, o operador precisa autenticar de novo. O logout invalida a sessão imediatamente. Relacionado: RF-02.

<a id="rn-03"></a>
## RN-03 · Tarefa do próprio painel é protegida

O painel não pode parar, desativar, editar nem excluir a tarefa agendada que o mantém em execução (nome padrão `PainelMaquina`). A tentativa é recusada e auditada. Relacionado: RF-25.

<a id="rn-04"></a>
## RN-04 · Processo do próprio painel é protegido

O painel não pode encerrar o próprio processo nem os processos de seus terminais por meio da aba de processos. Terminais são encerrados somente pelo gerenciamento de sessões. Relacionado: RF-17, RF-25.

<a id="rn-05"></a>
## RN-05 · Confirmação de ações destrutivas

Excluir, remover, parar ou encerrar exige confirmação explícita do operador. Para recursos de maior impacto (excluir serviço, excluir tarefa, operações destrutivas no Kubernetes), a confirmação exige digitar o nome do recurso. Relacionado: RF-27.

<a id="rn-06"></a>
## RN-06 · Auditoria obrigatória

Toda ação que altera estado (incluindo logins e logouts, criação e encerramento de terminais) gera um registro com data e hora, origem, ação, alvo e resultado. Registros nunca contêm token, cookie, hash ou o conteúdo digitado em terminais. Relacionado: RF-24, RNF-07.

<a id="rn-07"></a>
## RN-07 · Terminais herdam o privilégio do painel

Cada sessão de terminal roda com o mesmo privilégio do painel e exibe essa informação (por exemplo, "admin") de forma visível na interface. Relacionado: RF-03, RF-04.

<a id="rn-08"></a>
## RN-08 · Tarefas do Windows ocultas por padrão

Tarefas sob `\Microsoft\` não aparecem na listagem padrão. O operador pode exibi-las com um filtro explícito. Relacionado: RF-07.

<a id="rn-09"></a>
## RN-09 · Serviços críticos protegidos

Uma lista de serviços essenciais do Windows (por exemplo, `RpcSs`, `Winmgmt`, `EventLog`, `LSM`, `SamSs`) não pode ser parada, desativada, editada nem excluída pelo painel. O próprio serviço `sshd` **não** é crítico, mas exige confirmação por ser o canal de acesso remoto. Relacionado: RF-25.

<a id="rn-10"></a>
## RN-10 · Exposição fora do loopback

Por padrão o servidor escuta em `127.0.0.1`. Se a configuração apontar para outro endereço, o painel exige que `allowedHosts` esteja preenchido, mostra um aviso permanente na interface e registra o fato na auditoria de inicialização. Relacionado: RNF-01.

<a id="rn-11"></a>
## RN-11 · Provedor ausente não existe

Um provedor cuja ferramenta não está instalada não aparece na interface e suas rotas respondem **404**, sem gerar erro nem alerta. Quando a ferramenta é instalada, o provedor passa a aparecer na próxima detecção, sem reiniciar o painel. Relacionado: RF-23, RNF-10.

<a id="rn-12"></a>
## RN-12 · Execução controlada de ferramentas externas

Cada provedor invoca somente o seu próprio executável, usando lista de argumentos (sem shell), e apenas operações de uma allowlist. Operações marcadas como destrutivas passam pela [RN-05](#rn-05). Relacionado: RF-15 a RF-22.

<a id="rn-13"></a>
## RN-13 · Contexto do Kubernetes sempre visível

Na aba Kubernetes, o contexto e o namespace ativos ficam sempre visíveis. Operações destrutivas (excluir, escalar para zero, reiniciar rollout) exigem confirmação digitando o nome do recurso. Relacionado: RF-20.

<a id="rn-14"></a>
## RN-14 · Isolamento de falhas dos provedores

Cada chamada a um provedor tem tempo limite. Erro ou tempo esgotado em um provedor aparece só na aba dele e não afeta os demais nem o painel. Relacionado: RF-23, RNF-10.

<a id="rn-15"></a>
## RN-15 · Persistência e limite das sessões de terminal

Uma sessão de terminal continua viva sem navegador conectado e só termina por pedido do operador ou quando o shell sair. Cada sessão guarda cerca de 200 KB de histórico recente. O painel aceita no máximo **20** sessões simultâneas. Relacionado: RF-03, RF-05.

<a id="rn-16"></a>
## RN-16 · Token armazenado apenas como hash

O token de acesso é gerado aleatoriamente, exibido **uma única vez** na geração e guardado somente como hash. Para trocar o token, gera-se um novo. Relacionado: RF-01, RNF-09.

<a id="rn-17"></a>
## RN-17 · Validação de entradas

Todo valor recebido do cliente (nomes, caminhos, argumentos, identificadores) é validado por tipo, tamanho e conjunto de caracteres antes de chegar ao sistema. Operações fora da allowlist são recusadas com erro 400. Relacionado: RNF-01.
