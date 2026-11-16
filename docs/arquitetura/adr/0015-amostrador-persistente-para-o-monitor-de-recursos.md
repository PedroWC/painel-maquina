# 0015. Amostrador persistente para o monitor de recursos

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O monitor de recursos ([RF-28](../../requisitos/ers.md) a RF-31) precisa mostrar CPU, RAM e GPU gerais e por processo, com atualização de até "tempo real" (a cada 2 s). O padrão do painel ([ADR 0006](0006-powershell-com-parametros-por-ambiente.md)) é abrir um PowerShell novo por operação, o que não serve aqui. Medido numa máquina Windows 11 com 238 processos:

| Operação | Tempo |
|---|---|
| `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process` | cerca de 6,6 s |
| `Get-Process` lendo `.Path` de todos | cerca de 2,5 s |
| `Get-Counter` de um contador de GPU | cerca de 1 a 1,5 s cada |
| `Get-Process` (já com o PowerShell aberto) | 3 a 34 ms |
| Caminhos de executável por `Get-CimInstance Win32_Process` | cerca de 130 ms |
| Contadores de GPU (`GPU Engine`), 1ª leitura | cerca de 400 ms; as seguintes, cerca de 1 ms |
| `nvidia-smi` | cerca de 90 ms |

Além disso, os contadores de CPU têm nomes traduzidos (`Informações do Processador` em PT-BR), o que quebra consultas por nome.

## Decisão
1. **CPU e RAM gerais** vêm do próprio Node (`os.cpus()` com diferença entre leituras e `os.totalmem()`/`os.freemem()`), sem custo e sem depender do idioma.
2. **Processos e GPU** vêm de **um único PowerShell que fica vivo** (`src/monitor-sampler.js`). A cada linha `snap` recebida, ele responde uma linha JSON com os processos (tempo de CPU, memória de trabalho, caminho do executável) e a GPU (uso e memória por processo, uso e memória gerais). O script é estático ([ADR 0006](0006-powershell-com-parametros-por-ambiente.md)) e não recebe nada do cliente.
3. **A taxa de CPU por processo é calculada no Node**, pela diferença do tempo de CPU entre duas leituras. A GPU usa os contadores `GPU Engine` e `GPU Process Memory` (independentes de fabricante): o uso de um processo é o maior entre os tipos de engine (3D, copy, compute...), e o geral é o maior entre os adaptadores, no estilo do Gerenciador de Tarefas.
4. **O amostrador só existe enquanto alguém consulta.** Passados 2 minutos sem leituras, o monitor o encerra; a próxima consulta o sobe de novo e faz uma leitura de aquecimento (cerca de 2 s).
5. **Uma única coleta atende todos os clientes:** chamadas simultâneas compartilham a mesma leitura e há um cache de 1 s ([RN-21](../../requisitos/regras-de-negocio.md#rn-21)).
6. **Memória total e temperatura da GPU** vêm do `nvidia-smi` quando ele existe (opcional, [RN-11](../../requisitos/regras-de-negocio.md#rn-11)); sem ele, o painel mostra só os contadores do Windows.

## Alternativas consideradas
- **PowerShell novo a cada leitura:** de 3 a 9 s por leitura; inviável para "tempo real" e pesado para a própria máquina que se quer observar.
- **Contadores de desempenho por nome** (`\Processor Information(_Total)\% Processor Utility`): falham em Windows traduzido.
- **Módulo nativo ou executável próprio:** exigiria compilar e distribuir código nativo; descartado para manter o painel em Node puro ([ADR 0002](0002-nodejs-com-dependencias-minimas.md)).
- **`wmic` e `tasklist`:** `wmic` foi removido do Windows 11 recente e `tasklist` não dá tempo de CPU.

## Consequências
- Leituras seguintes custam dezenas de milissegundos; a primeira leva cerca de 2 s.
- Há um processo auxiliar (PowerShell) enquanto o monitor está em uso; ele herda a elevação do painel, o que é necessário para ler o caminho de processos de outros usuários e do sistema.
- Sem elevação, parte dos caminhos fica ilegível e esses processos são classificados só por nome ([RN-19](../../requisitos/regras-de-negocio.md#rn-19)).
- O consumo de GPU por processo exige Windows 10 1709 ou superior; sem os contadores, a GPU aparece como indisponível ou só com os dados do `nvidia-smi`.
- A memória somada por grupo usa a memória de trabalho de cada processo, que conta páginas compartilhadas mais de uma vez; é um total aproximado e a RAM geral vem do sistema.
