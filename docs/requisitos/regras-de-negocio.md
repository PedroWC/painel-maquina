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
## RN-07 · O privilégio do terminal é sempre visível

Cada sessão de terminal exibe de forma visível na interface se foi aberta **com** administrador ("admin") ou **sem** ("sem admin"). O privilégio é escolhido ao criar a sessão ([RN-18](#rn-18)) e nunca excede o do painel. Relacionado: RF-03, RF-04.

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

Na aba Kubernetes, o contexto e o namespace ativos ficam sempre visíveis, em um banner e em seletores. Operações que alteram o cluster (excluir, escalar e reiniciar rollout) exigem confirmação digitando o **nome do recurso**, e o servidor confere o texto. O painel nunca altera o contexto do `kubectl` no kubeconfig: o contexto e o namespace escolhidos na tela vão explicitamente em cada comando. Relacionado: RF-20.

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

<a id="rn-18"></a>
## RN-18 · Terminal com ou sem administrador

Ao abrir um terminal, o operador escolhe se ele tem permissão de administrador. O padrão é o privilégio do painel (administrador, quando o painel está elevado). Abrir **sem** administrador usa um token restrito do próprio painel: os grupos de administrador ficam como "somente negar" e os privilégios são removidos ([ADR 0014](../arquitetura/adr/0014-terminal-sem-administrador-por-token-restrito.md)). Se o painel não está elevado, pedir administrador é recusado (400). A escolha é auditada ([RN-06](#rn-06)). Relacionado: RF-03, RN-07.

<a id="rn-19"></a>
## RN-19 · Windows (nativo) e programas

No monitor, um processo é **do Windows** quando seu executável está dentro da pasta do Windows (`%SystemRoot%`) ou do Windows Defender, ou quando é o núcleo do sistema (PID 0 a 4, `System`, `Registry`, `Memory Compression`) ou um processo crítico do Windows. Todo o resto é **programa**. Sem permissão para ler o caminho (painel sem elevação), só o núcleo e os críticos conhecidos contam como Windows. Os totais de RAM por grupo somam a memória de trabalho de cada processo e são aproximados, porque páginas compartilhadas contam mais de uma vez. Relacionado: RF-29.

<a id="rn-20"></a>
## RN-20 · Processos críticos do Windows não são encerrados

O painel nunca encerra os processos sem os quais o Windows para ou reinicia: `System`, `Registry`, `smss`, `csrss`, `wininit`, `winlogon`, `services`, `lsass`, `lsaiso`, `lsm`, `Memory Compression`, `Secure System` e `svchost` (que pode hospedar serviços essenciais; para um serviço, usa-se a aba Serviços). A conferência é feita **no servidor, pelo nome**, antes de encerrar, e vale para a aba Processos e para o monitor. Encerrar qualquer outro processo do Windows exige digitar o nome do processo. A recusa responde 409 e é auditada. Relacionado: RF-25, RF-31, RN-04.

<a id="rn-21"></a>
## RN-21 · Uma coleta para todos

A leitura de recursos é compartilhada: chamadas simultâneas usam a mesma coleta e há um cache de cerca de 1 segundo, de modo que vários navegadores abertos não multiplicam o custo. O amostrador é encerrado após 2 minutos sem consultas. Relacionado: RF-28, RNF-12.
