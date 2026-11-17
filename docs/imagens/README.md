# Imagens do README

Capturas reais da interface, usadas na abertura do [README](../../README.md) para mostrar o que o painel faz.

| Arquivo | Mostra |
|---|---|
| `monitor-resumo.png` | Aba Monitor, visão resumo: CPU, RAM, GPU e o consumo da máquina, do Windows e dos programas |
| `monitor-detalhado.png` | Aba Monitor, visão detalhada, filtrada em processos do Windows (com os críticos marcados como protegidos) |
| `terminal-admin.png` | Terminal aberto **com** administrador |
| `terminal-sem-admin.png` | Terminal aberto **sem** administrador, com o mesmo comando recebendo "Acesso negado" |
| `servicos.png` | Aba Serviços |
| `provedores.png` | Aba Provedores, com as tecnologias detectadas e as não encontradas |
| `login.png` | Tela de login |

## Como foram geradas

As imagens vêm de uma **instância de teste descartável**: uma cópia do projeto em outra pasta, em outra porta (`8791`), com um token de teste, e **nunca** o painel em uso. Um Chrome sem janela (`--headless`) abre a interface, entra, navega pelas abas e captura as telas, recortando só a área que importa.

## Regras para novas capturas

O repositório é público. Antes de adicionar ou trocar uma imagem:

1. Gere sempre numa instância de teste, nunca no painel real, e **olhe a imagem inteira** antes de versionar.
2. Nada pessoal: nomes de tarefas, containers ou projetos próprios, nome de usuário, nome da máquina, endereços de rede, tokens, e-mails.
3. Cuidado com listas de processos e programas: mostre só processos genéricos do Windows (por exemplo, filtrando em "Windows") ou recorte a tabela. Nunca mostre nomes de ferramentas pessoais.
4. Nos terminais, use uma pasta genérica (como `C:\Windows\Temp`) e comandos que não revelem usuário ou máquina (evite `whoami` e `hostname`).
5. Mantenha cada arquivo pequeno (algumas dezenas de KB) e com texto alternativo descritivo no README.
