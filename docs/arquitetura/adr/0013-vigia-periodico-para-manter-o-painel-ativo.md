# 0013. Vigia periódico para manter o painel ativo

- **Status:** aceito (complementa o [ADR 0007](0007-execucao-elevada-via-agendador.md), que continua válido)
- **Data:** 2026-11-16

## Contexto
O [ADR 0007](0007-execucao-elevada-via-agendador.md) decidiu executar o painel por uma tarefa agendada e previu o reinício automático em falha por meio da opção "reiniciar em caso de falha" do Agendador (`-RestartCount` e `-RestartInterval`).

Ao verificar o comportamento na prática, com uma tarefa descartável, o processo do painel foi encerrado à força e a tarefa **não** o reiniciou: ficou no estado "Pronta" com resultado 1 e o painel permaneceu fora do ar por mais de dois minutos. Essa opção do Agendador cobre falhas ao iniciar a tarefa, não um processo que termina com código de saída diferente de zero ou é finalizado. Como o requisito [RNF-03](../../requisitos/ers.md) exige que o painel volte sozinho, a opção sozinha não basta.

## Decisão
Manter as opções de reinício e **acrescentar um segundo gatilho à mesma tarefa**: um vigia que dispara a cada 2 minutos, indefinidamente. Com `MultipleInstances IgnoreNew`, o disparo não faz nada enquanto o painel está rodando e inicia uma nova instância se ele tiver parado.

- O gatilho é criado com `New-ScheduledTaskTrigger -Once -At <hoje> -RepetitionInterval 2 min` **sem** `-RepetitionDuration`. Informar `[TimeSpan]::MaxValue` é recusado pelo Agendador (erro `0x80041318`); omitir a duração significa repetição indefinida.
- O reinício acontece, no pior caso, cerca de 2 minutos depois da queda. Medido: aproximadamente 70 segundos.
- O comportamento é coberto por um teste automático (executado no CI e com `PAINEL_TESTES_LENTOS=1`) que encerra o processo e espera o novo.

## Alternativas consideradas
- **Supervisor em Node** (um processo que inicia o painel e o reinicia ao sair): reinício imediato, mas é mais código e mais um processo elevado para manter, e o supervisor também poderia cair.
- **Serviço do Windows** com política de recuperação: depende de um empacotador externo, já descartado no ADR 0007.
- **Aceitar só a opção de reinício do Agendador:** não funciona para o caso verificado.

## Consequências
O painel volta sozinho após uma queda, sem código novo e sem dependências. A tarefa passa a ter dois gatilhos; quem editar a tarefa manualmente deve preservar o vigia. Um intervalo de até 2 minutos sem painel é aceitável para uma ferramenta local de administração.
