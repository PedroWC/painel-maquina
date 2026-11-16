'use strict';

// Aba Processos e portas (RF-17, RF-25): mostra quem usa cada porta e encerra
// processos. O servidor marca o que é do painel (protected); a interface só desabilita.

(function () {
  const filtro = document.getElementById('processos-filtro');
  const atualizar = document.getElementById('processos-atualizar');
  const tabelaPortas = document.getElementById('processos-portas');
  const tabelaProcessos = document.getElementById('processos-lista');

  let dados = { procs: [], ports: [] };
  let temporizador = null;

  async function encerrar(item) {
    const confirmado = await UI.confirmar({
      titulo: 'Encerrar processo',
      mensagem: `Encerrar "${item.name}" (PID ${item.pid})? Dados não salvos desse programa serão perdidos.`,
      rotulo: 'Encerrar',
    });
    if (!confirmado) return;
    const { status, dados: resposta } = await Painel.api('/api/processes/kill', { method: 'POST', body: { pid: item.pid } });
    if (status === 200) Painel.aviso(`Processo "${item.name}" encerrado.`, 'ok');
    else Painel.aviso(resposta.error || 'Não foi possível encerrar o processo.', 'erro');
    carregar();
  }

  const nomeComSelo = (item) => {
    const nome = UI.criar('span', { texto: item.name || '—' });
    return item.protected ? UI.criar('span', {}, [nome, document.createTextNode(' '), UI.selo('protegido')]) : nome;
  };

  function desenhar() {
    const termo = filtro.value.trim().toLowerCase();
    const bate = (item) =>
      !termo ||
      String(item.pid).includes(termo) ||
      (item.name || '').toLowerCase().includes(termo) ||
      String(item.port || '').includes(termo);

    UI.tabela(
      tabelaPortas,
      [
        { titulo: 'Porta', valor: (p) => p.port },
        { titulo: 'Endereço', valor: (p) => p.addr },
        { titulo: 'Processo', valor: nomeComSelo },
        { titulo: 'PID', valor: (p) => p.pid },
      ],
      dados.ports.filter(bate),
      'Nenhuma porta em escuta encontrada.',
    );

    UI.tabela(
      tabelaProcessos,
      [
        { titulo: 'Nome', valor: nomeComSelo },
        { titulo: 'PID', valor: (p) => p.pid },
        { titulo: 'Memória (MB)', valor: (p) => p.mem },
        { titulo: 'CPU (s)', valor: (p) => p.cpu },
        {
          titulo: 'Ações',
          valor: (p) =>
            UI.acoes(
              UI.botao('Encerrar', {
                classe: 'mini perigo',
                aoClicar: () => encerrar(p),
                desabilitado: p.protected,
                rotulo: `Encerrar ${p.name}`,
              }),
            ),
        },
      ],
      dados.procs.filter(bate),
      'Nenhum processo encontrado.',
    );
  }

  async function carregar() {
    const { status, dados: resposta } = await Painel.api('/api/processes');
    if (status !== 200) return Painel.aviso(resposta.error || 'Não foi possível listar os processos.', 'erro');
    dados = resposta;
    return desenhar();
  }

  filtro.addEventListener('input', desenhar);
  atualizar.addEventListener('click', carregar);

  Painel.registrarAba('processos', {
    mostrar() {
      carregar();
      temporizador = setInterval(carregar, 10000); // RF-26
    },
    esconder() {
      clearInterval(temporizador);
      temporizador = null;
    },
  });
})();
