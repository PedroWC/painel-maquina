# Histórias de usuário

Formato: **Como** operador **quero** … **para** …, com critérios de aceite em Gherkin. Cada história aponta para os requisitos ([ERS](../requisitos/ers.md)) e casos de uso ([casos de uso](casos-de-uso.md)).

## US-01 · Entrar no painel
**Como** operador **quero** entrar com um token **para** que só eu acesse o painel. · RF-01 · UC-01 · RN-01, RN-16

```gherkin
Cenário: Login válido
  Dado que estou na tela de login
  Quando informo o token correto
  Então o painel abre e minha sessão fica ativa

Cenário: Token inválido
  Quando informo um token incorreto
  Então vejo "token inválido" e continuo na tela de login

Cenário: Bloqueio por tentativas
  Dado que errei o token 5 vezes seguidas
  Quando tento novamente, mesmo com o token correto
  Então sou bloqueado por 5 minutos e vejo o tempo restante
```

## US-02 · Sair do painel
**Como** operador **quero** encerrar a sessão **para** não deixar o acesso aberto. · RF-02 · UC-02 · RN-02

```gherkin
Cenário: Logout
  Dado que estou autenticado
  Quando escolho "Sair"
  Então volto ao login e a sessão anterior deixa de funcionar

Cenário: Sessão expirada
  Dado que se passaram 12 horas desde o login
  Quando faço uma ação
  Então sou levado à tela de login
```

## US-03 · Abrir um terminal, com ou sem administrador
**Como** operador **quero** abrir um terminal escolhendo shell, pasta e se ele tem permissão de administrador **para** trabalhar na máquina pelo navegador com o menor privilégio necessário. · RF-03 · UC-03 · RN-07, RN-15, RN-18

```gherkin
Cenário: Abrir PowerShell em uma pasta
  Dado que estou na aba Terminais
  Quando escolho PowerShell, informo uma pasta existente e confirmo
  Então um terminal abre naquela pasta, marcado como "admin"

Cenário: Terminal sem administrador
  Dado que estou na aba Terminais
  Quando desmarco "Administrador" e abro um terminal
  Então ele abre marcado como "sem admin" e ações de administrador falham

Cenário: Limite de sessões
  Dado que já existem 20 sessões
  Quando tento abrir outra
  Então vejo uma mensagem pedindo para encerrar alguma
```

## US-04 · Retomar e gerenciar sessões de terminal
**Como** operador **quero** voltar a uma sessão depois de fechar a aba **para** não perder o que estava rodando. · RF-04, RF-05, RF-06 · UC-04 · RN-15

```gherkin
Cenário: Reanexar
  Dado que fechei o navegador com um comando em execução
  Quando abro a aba Terminais e escolho a sessão
  Então vejo o histórico recente e o comando continua rodando

Cenário: Encerrar sessão
  Quando encerro uma sessão e confirmo
  Então o shell termina e a sessão sai da lista
```

## US-05 · Controlar tarefas agendadas
**Como** operador **quero** executar, parar, ativar e desativar tarefas **para** controlar o que roda em segundo plano. · RF-07, RF-08, RF-09 · UC-05 · RN-03, RN-08

```gherkin
Cenário: Listar sem ruído
  Quando abro a aba Tarefas
  Então não vejo as tarefas de \Microsoft\ até marcar "Mostrar tarefas do Windows"

Cenário: Desativar tarefa
  Quando desativo "MinhaTarefa"
  Então seu estado muda para "Desativada" e não será executada pelo agendador

Cenário: Tarefa do painel
  Quando tento parar ou desativar a tarefa do próprio painel
  Então a ação é recusada com uma explicação
```

## US-06 · Criar e editar tarefas
**Como** operador **quero** criar e editar tarefas agendadas **para** automatizar rotinas. · RF-10 · UC-06 · RN-03, RN-17

```gherkin
Cenário: Criar tarefa diária
  Quando crio a tarefa "MinhaTarefa" com comando, gatilho diário às 03:00 e conta do sistema
  Então ela aparece na lista com próxima execução às 03:00

Cenário: Dados inválidos
  Quando deixo o comando vazio
  Então o formulário indica o campo e não cria a tarefa
```

## US-07 · Excluir tarefas
**Como** operador **quero** excluir tarefas **para** limpar o que não uso mais. · RF-10, RF-27 · UC-07 · RN-03, RN-05

```gherkin
Cenário: Exclusão confirmada
  Quando escolho excluir "MinhaTarefa" e digito o nome para confirmar
  Então a tarefa deixa de existir

Cenário: Nome digitado errado
  Quando digito um nome diferente
  Então o botão de confirmar permanece desabilitado
```

## US-08 · Controlar serviços
**Como** operador **quero** iniciar, parar, reiniciar e mudar a inicialização de serviços **para** manter a máquina funcionando como preciso. · RF-11, RF-12, RF-13 · UC-08 · RN-09

```gherkin
Cenário: Reiniciar serviço
  Quando reinicio "meu-servico"
  Então o estado passa por "Parando" e "Iniciando" até "Em execução"

Cenário: Serviço crítico
  Quando tento parar um serviço crítico do Windows
  Então a ação é recusada

Cenário: Parar o canal remoto
  Quando tento parar o sshd
  Então peço confirmação reforçada antes de executar
```

## US-09 · Criar, editar e excluir serviços
**Como** operador **quero** gerenciar o cadastro de serviços **para** manter meus programas rodando como serviço. · RF-14 · UC-09 · RN-09, RN-05

```gherkin
Cenário: Criar serviço
  Quando informo nome, executável e inicialização automática
  Então o serviço é criado e aparece na lista

Cenário: Excluir serviço
  Quando digito o nome do serviço e confirmo
  Então o serviço é removido
```

## US-10 · Gerenciar containers Docker
**Como** operador **quero** controlar containers e imagens **para** operar meus ambientes sem usar a linha de comando. · RF-15, RF-16 · UC-10 · RN-11, RN-12

```gherkin
Cenário: Ver logs
  Quando abro os logs de um container
  Então vejo as últimas linhas com horário

Cenário: Docker parado
  Dado que o motor do Docker não está respondendo
  Quando abro a aba Docker
  Então vejo a mensagem de que o Docker não responde, sem erro técnico bruto
```

## US-11 · Encerrar processos e ver portas
**Como** operador **quero** ver quem usa cada porta e encerrar processos **para** resolver conflitos e travamentos. · RF-17 · UC-11 · RN-04

```gherkin
Cenário: Descobrir dono de uma porta
  Quando filtro pela porta 8080
  Então vejo o processo que a mantém em escuta

Cenário: Processo do painel
  Quando tento encerrar o processo do próprio painel
  Então a ação é recusada
```

## US-12 · Gerenciar tecnologias opcionais
**Como** operador **quero** gerenciar pm2, Kubernetes, Compose, Podman e WSL no mesmo lugar **para** não alternar entre ferramentas. · RF-18 a RF-22 · UC-12 · RN-11 a RN-14

```gherkin
Cenário: Ferramenta instalada
  Dado que o pm2 está instalado
  Quando abro a aba pm2
  Então vejo seus processos e posso reiniciá-los

Cenário: Ferramenta ausente
  Dado que o kubectl não está instalado
  Então a aba Kubernetes não aparece

Cenário: Kubernetes com contexto visível
  Quando abro a aba Kubernetes
  Então vejo o contexto e o namespace ativos no topo
  E para excluir um recurso preciso digitar o nome dele

Cenário: Falha isolada
  Dado que o provedor pm2 falhou
  Então as abas dos demais provedores continuam funcionando
```

## US-13 · Saber o que está disponível
**Como** operador **quero** ver quais tecnologias o painel detectou **para** entender por que uma aba aparece ou não. · RF-23 · UC-13 · RN-11

```gherkin
Cenário: Instalar nova ferramenta
  Dado que instalei o pm2 depois de abrir o painel
  Quando forço uma nova detecção
  Então a aba pm2 aparece sem reiniciar o painel
```

## US-14 · Ter trilha de auditoria
**Como** operador **quero** registro de tudo que foi alterado **para** saber o que aconteceu e quando. · RF-24 · todos · RN-06

```gherkin
Cenário: Ação registrada
  Quando excluo uma tarefa
  Então existe um registro com data, origem, ação, alvo e resultado
  E o registro não contém token, cookie ou texto digitado em terminais
```

## US-15 · Ser protegido de erros graves
**Como** operador **quero** que o painel impeça ações que o derrubariam **para** não perder o acesso. · RF-25 · UC-05, UC-08, UC-11 · RN-03, RN-04, RN-09

```gherkin
Cenário: Proteções
  Quando tento excluir a tarefa do painel, encerrar o processo do painel ou parar um serviço crítico
  Então a ação é recusada e fica registrada
```

## US-16 · Ver dados atualizados
**Como** operador **quero** listas que se atualizam sozinhas **para** não precisar recarregar a página. · RF-26 · todos

```gherkin
Cenário: Atualização periódica
  Dado que estou na aba Serviços
  Quando um serviço muda de estado fora do painel
  Então a lista reflete a mudança em até alguns segundos

Cenário: Atualização manual
  Quando clico em "Atualizar"
  Então a lista é recarregada imediatamente
```

## US-17 · Confirmar antes de destruir
**Como** operador **quero** confirmar ações destrutivas **para** evitar acidentes. · RF-27 · todos · RN-05

```gherkin
Cenário: Confirmação simples
  Quando escolho parar um container
  Então vejo uma confirmação antes de executar

Cenário: Confirmação por nome
  Quando escolho excluir um serviço ou uma tarefa
  Então preciso digitar o nome do recurso para habilitar o botão
```

## US-18 · Acompanhar o consumo da máquina
**Como** operador **quero** ver CPU, RAM e GPU, separando o Windows dos programas, **para** descobrir o que está pesando e encerrar o que for preciso. · RF-28 a RF-31 · UC-14 · RN-19, RN-20, RN-21

```gherkin
Cenário: Resumo
  Dado que estou na aba Monitor
  Quando abro a visão Resumo
  Então vejo CPU, RAM e GPU gerais, o consumo do Windows e dos programas e os maiores consumidores

Cenário: Detalhado
  Quando escolho a visão Detalhado
  Então vejo todos os processos e posso filtrar por nome, PID ou tipo e ordenar por CPU, RAM, GPU ou nome

Cenário: Intervalo de atualização
  Quando escolho "30 segundos"
  Então os dados passam a ser atualizados a cada 30 segundos

Cenário: Encerrar um programa
  Quando escolho Encerrar em um programa e confirmo
  Então o processo é encerrado e a lista é atualizada

Cenário: Processo do Windows
  Quando escolho Encerrar em um processo do Windows
  Então preciso digitar o nome do processo para habilitar o botão

Cenário: Processo crítico
  Quando o processo é essencial ao Windows, como csrss ou svchost
  Então o botão fica desabilitado e o servidor recusa o pedido
```
