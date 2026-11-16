# 0007. Execução elevada pelo Agendador de Tarefas

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O painel precisa rodar sempre, com privilégios de administrador, sem pedir confirmação do UAC a cada início e sem janela aberta.

## Decisão
Instalar uma tarefa agendada `PainelMaquina` com gatilho "na inicialização", conta do usuário com logon S4U (sem armazenar senha), nível de execução "mais alto", reinício automático em falha e sem limite de tempo. A instalação e a remoção são feitas por `scripts/instalar-tarefa.ps1` e `scripts/desinstalar-tarefa.ps1`, executados uma vez em um PowerShell de administrador. A tarefa é protegida pelo próprio painel ([RN-03](../../requisitos/regras-de-negocio.md#rn-03)).

## Alternativas consideradas
- Serviço do Windows: exigiria empacotador (por exemplo NSSM) e teria sessão sem acesso ao ambiente do usuário.
- Pasta Inicializar: depende de logon interativo e não eleva sem UAC.
- Conta SYSTEM: mais privilégio que o necessário e sem o ambiente do usuário (Docker, PATH).

## Consequências
Execução oculta e persistente com o privilégio necessário. Com S4U o processo não tem credenciais de rede do usuário; para o uso local isso é suficiente.
