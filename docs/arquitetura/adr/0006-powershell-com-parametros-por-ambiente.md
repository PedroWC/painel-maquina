# 0006. PowerShell com `-EncodedCommand` e parâmetros por ambiente

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
Tarefas agendadas, serviços e processos são geridos por cmdlets PowerShell. Montar comandos concatenando texto vindo do navegador abre espaço para injeção de comandos em um processo elevado.

## Decisão
Os scripts PowerShell são **estáticos** (constantes no código) e enviados com `-EncodedCommand` (Base64 UTF-16LE). Os dados do usuário seguem em uma variável de ambiente como JSON (`PP_PARAMS`) e o script os lê com `ConvertFrom-Json`. Nenhum dado do usuário é concatenado ao texto do script. Processos como `sc.exe` usam `execFile` com array de argumentos.

## Alternativas consideradas
- Interpolar valores no script com escape: frágil e difícil de provar correto.
- API COM/WMI direta em Node: exigiria módulos nativos adicionais.

## Consequências
Elimina uma classe inteira de injeção. Cada chamada inicia um processo PowerShell (alguns centenas de milissegundos), aceitável para listagens periódicas.
