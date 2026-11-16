# Roteiro de smoke (manual)

Executado antes de cada release, em uma máquina Windows real, com o painel instalado pela [tarefa elevada](../../docs/operacao/instalacao.md). Cobre o que a automação não alcança: interface no navegador, tempo de resposta, reinício do computador e acesso por túnel. Registre o resultado (data, versão, quem executou) na descrição da release.

> Use apenas recursos descartáveis: tarefas, serviços e containers com o prefixo `PainelTeste_`. Não altere nada que você não criou para o teste.

## 1. Instalação e início automático (RNF-03)

- [ ] `.\scripts\instalar-tarefa.ps1 -IniciarAgora` conclui sem erro e mostra os dados da tarefa
- [ ] `http://127.0.0.1:8780` abre e pede o token
- [ ] Após login, o selo **administrador** aparece
- [ ] Reiniciar o computador: cerca de 1 minuto depois do logon (ou até antes dele), o endereço volta a abrir
- [ ] Encerrar o processo `node` do painel no Gerenciador de Tarefas: em até 2 minutos o painel volta sozinho (veja o `painel.log`)
- [ ] Reexecutar o instalador informa "atualizada" e não cria uma segunda tarefa

## 2. Acesso e sessão (RF-01, RF-02, RN-01, RN-02)

- [ ] Token errado mostra "Token inválido"
- [ ] Cinco tokens errados seguidos bloqueiam, mesmo com o token certo, e a tela mostra o tempo restante
- [ ] "Sair" volta ao login e o botão Voltar do navegador não reabre o painel
- [ ] O painel não responde por outro endereço da rede (`http://<ip-da-máquina>:8780` recusa a conexão)

## 3. Terminais (RF-03 a RF-06, RN-07, RN-15)

- [ ] Abrir PowerShell, cmd e (se instalados) Git Bash e WSL
- [ ] `whoami /groups` mostra "High Mandatory Level" e a sessão exibe **admin**
- [ ] Fechar a aba do navegador com `ping -t 127.0.0.1` rodando, reabrir e reanexar: o histórico aparece e o ping continua
- [ ] Redimensionar a janela ajusta o terminal; `Ctrl+C` interrompe o ping
- [ ] Renomear e encerrar (com confirmação) removem a sessão; o ping some do Gerenciador de Tarefas
- [ ] Abrir 20 sessões: a 21ª é recusada com mensagem clara

## 4. Tarefas (RF-07 a RF-10, RN-03, RN-05, RN-08)

- [ ] A lista não mostra tarefas de `\Microsoft\` até marcar "Mostrar tarefas do Windows"
- [ ] Criar `PainelTeste_tarefa` (diária, conta do sistema), executar, desativar, ativar, editar e excluir
- [ ] Excluir só habilita o botão depois de digitar o nome exato
- [ ] Criar com nome repetido pede confirmação para substituir
- [ ] `PainelMaquina` aparece como **protegida**: parar, desativar, editar e excluir estão desabilitados

## 5. Serviços (RF-11 a RF-14, RN-05, RN-09)

- [ ] Criar `PainelTeste_servico` (manual), editar nome de exibição, mudar a inicialização e excluir (digitando o nome)
- [ ] Serviços críticos (por exemplo `EventLog`) aparecem como **crítico** e só permitem iniciar
- [ ] Tentar parar o `sshd` pede para digitar o nome (**não conclua** a parada se você usa o acesso remoto)

## 6. Processos e portas (RF-17, RN-04)

- [ ] A tabela de portas mostra a 8780 com o processo `node` marcado como **protegido**
- [ ] Encerrar um processo descartável (por exemplo, um `notepad` aberto para o teste) pede confirmação e o encerra
- [ ] O botão Encerrar do processo do painel e dos shells dos terminais está desabilitado

## 7. Provedores (RF-15, RF-16, RF-23, RN-11 a RN-14)

- [ ] A aba **Provedores** mostra cada tecnologia como disponível ou não encontrada, com versão
- [ ] Docker instalado e **motor parado**: a aba mostra "o motor não está respondendo", sem erro técnico
- [ ] Docker com motor ligado: criar um container descartável pela linha de comando, ver na aba, parar (confirmação), ver logs, remover
- [ ] Instalar uma ferramenta nova (por exemplo, pm2) e clicar em "Detectar novamente": a aba aparece sem reiniciar o painel

## 8. Interface e transversais (RF-24, RF-26, RF-27, RNF-02, RNF-05, RNF-11)

- [ ] Listas de tarefas, serviços, processos e provedores respondem em até 3 segundos
- [ ] As listas se atualizam sozinhas em até 15 segundos e o botão Atualizar recarrega na hora
- [ ] Toda ação destrutiva pede confirmação
- [ ] O `audit.log` registra login, logout, as ações acima e as recusas, **sem** o token, cookies nem o texto digitado nos terminais
- [ ] A interface é utilizável só com o teclado nos controles principais e em tela estreita (celular)

## 9. Acesso por túnel (RNF-01)

- [ ] De outro computador: `ssh -L 8780:127.0.0.1:8780 usuario@maquina` e abrir `http://127.0.0.1:8780` localmente funciona normalmente, inclusive o terminal

## 10. Limpeza

- [ ] Nenhum recurso `PainelTeste_*` restou (tarefas, serviços, containers)
- [ ] `.\scripts\desinstalar-tarefa.ps1` remove a tarefa e mantém `config.json`, `audit.log` e `painel.log` (rode apenas se for desinstalar de fato)
