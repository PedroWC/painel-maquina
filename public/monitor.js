'use strict';

// Aba Monitor (RF-28 a RF-31): CPU, RAM e GPU gerais, consumo separado entre o Windows e os
// programas, visão resumida ou detalhada, intervalo de atualização escolhido pelo operador e
// encerramento de processos. O servidor marca o que é protegido; a interface só desabilita.

(function () {
  const campoModo = document.getElementById('mon-modo');
  const campoIntervalo = document.getElementById('mon-intervalo');
  const campoOrdem = document.getElementById('mon-ordem');
  const campoFiltro = document.getElementById('mon-filtro');
  const campoTipo = document.getElementById('mon-tipo');
  const barraDetalhe = document.getElementById('mon-detalhe');
  const botaoPausar = document.getElementById('mon-pausar');
  const botaoAgora = document.getElementById('mon-agora');
  const textoEstado = document.getElementById('mon-estado');
  const cartoes = document.getElementById('mon-cartoes');
  const grupos = document.getElementById('mon-grupos');
  const tituloLista = document.getElementById('mon-titulo-lista');
  const lista = document.getElementById('mon-lista');
  const tituloWindows = document.getElementById('mon-titulo-windows');
  const listaWindows = document.getElementById('mon-lista-windows');

  const CHAVE = 'painel.monitor';
  let temporizador = null;
  let ativo = false;
  let pausado = false;
  let carregando = false;
  let dados = null;
  let congelada = false;
  const dialogo = document.getElementById('dialogo');

  function lerPreferencias() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) || '{}');
      if (['resumo', 'detalhado'].includes(salvo.modo)) campoModo.value = salvo.modo;
      if ([...campoIntervalo.options].some((o) => o.value === String(salvo.intervalo))) campoIntervalo.value = String(salvo.intervalo);
      if ([...campoOrdem.options].some((o) => o.value === salvo.ordem)) campoOrdem.value = salvo.ordem;
    } catch {
      // sem armazenamento local: usa os padrões
    }
  }

  function salvarPreferencias() {
    try {
      localStorage.setItem(
        CHAVE,
        JSON.stringify({ modo: campoModo.value, intervalo: Number(campoIntervalo.value), ordem: campoOrdem.value }),
      );
    } catch {
      // ignora
    }
  }

  const formatar = (valor, casas = 1) =>
    valor === null || valor === undefined ? '—' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const porcentagem = (valor) => (valor === null || valor === undefined ? '—' : `${formatar(valor)}%`);
  const memoria = (mb) => (mb === null || mb === undefined ? '—' : mb >= 1024 ? `${formatar(mb / 1024, 1)} GB` : `${formatar(mb, 0)} MB`);

  function medidor(titulo, percentual, linhas) {
    const valor = percentual === null || percentual === undefined ? null : Math.max(0, Math.min(100, percentual));
    const barra = UI.criar('div');
    barra.style.width = `${valor === null ? 0 : valor}%`;
    const classe = valor !== null && valor >= 90 ? 'critico' : valor !== null && valor >= 70 ? 'alto' : '';
    const trilho = UI.criar('div', { classe: `medidor ${classe}`.trim(), role: 'progressbar', 'aria-label': titulo }, [barra]);
    if (valor !== null) {
      trilho.setAttribute('aria-valuemin', '0');
      trilho.setAttribute('aria-valuemax', '100');
      trilho.setAttribute('aria-valuenow', String(valor));
    }
    return UI.criar('div', { classe: 'medida' }, [
      UI.criar('h3', { texto: titulo }),
      UI.criar('div', { classe: 'medida-valor', texto: valor === null ? 'Indisponível' : porcentagem(valor) }),
      trilho,
      ...linhas.map((texto) => UI.criar('p', { classe: 'medida-linha', texto })),
    ]);
  }

  function desenharCartoes() {
    const { cpu, ram, gpu } = dados;
    let linhaGpu = ['Sem contadores de GPU nesta máquina.'];
    if (gpu) {
      linhaGpu = [
        gpu.names.length > 0 ? gpu.names.join(', ') : 'GPU',
        gpu.memTotalMb ? `Memória de vídeo: ${memoria(gpu.memUsedMb)} de ${memoria(gpu.memTotalMb)}` : `Memória de vídeo em uso: ${memoria(gpu.memUsedMb)}`,
      ];
      if (gpu.temperatureC !== null) linhaGpu.push(`Temperatura: ${formatar(gpu.temperatureC, 0)} °C`);
    }
    cartoes.replaceChildren(
      medidor('CPU', cpu.percent, [`${cpu.cores} núcleos lógicos`]),
      medidor('Memória (RAM)', ram.percent, [`${memoria(ram.usedMb)} de ${memoria(ram.totalMb)}`]),
      medidor('GPU', gpu ? gpu.percent : null, linhaGpu),
    );
  }

  function desenharGrupos() {
    const { cpu, ram, gpu, groups } = dados;
    const total = groups.windows.count + groups.programas.count;
    UI.tabela(
      grupos,
      [
        { titulo: 'Consumo', valor: (l) => l.nome },
        { titulo: 'Processos', valor: (l) => l.processos },
        { titulo: 'CPU', valor: (l) => porcentagem(l.cpu) },
        { titulo: 'RAM', valor: (l) => memoria(l.ram) },
        { titulo: 'GPU', valor: (l) => porcentagem(l.gpu) },
      ],
      [
        { nome: 'Geral da máquina', processos: total, cpu: cpu.percent, ram: ram.usedMb, gpu: gpu ? gpu.percent : null },
        { nome: 'Windows (nativo)', processos: groups.windows.count, cpu: groups.windows.cpu, ram: groups.windows.ramMb, gpu: gpu && gpu.perProcess ? groups.windows.gpu : null },
        { nome: 'Programas (não nativos)', processos: groups.programas.count, cpu: groups.programas.cpu, ram: groups.programas.ramMb, gpu: gpu && gpu.perProcess ? groups.programas.gpu : null },
      ],
    );
  }

  async function encerrar(item) {
    const doWindows = item.category === 'windows';
    const mensagem = doWindows
      ? `"${item.name}" (PID ${item.pid}) é um processo do Windows. Encerrá-lo pode fechar recursos do sistema ou travar a sessão.`
      : `Encerrar "${item.name}" (PID ${item.pid})? Dados não salvos desse programa serão perdidos.`;
    const confirmado = doWindows
      ? await UI.confirmarNome({ titulo: 'Encerrar processo do Windows', mensagem, nome: item.name, rotulo: 'Encerrar' })
      : await UI.confirmar({ titulo: 'Encerrar processo', mensagem, rotulo: 'Encerrar' });
    if (!confirmado) return;
    const { status, dados: resposta } = await Painel.api('/api/processes/kill', { method: 'POST', body: { pid: item.pid } });
    if (status === 200) Painel.aviso(`Processo "${item.name}" encerrado.`, 'ok');
    else Painel.aviso(resposta.error || 'Não foi possível encerrar o processo.', 'erro');
    carregar();
  }

  function nomeComSelo(item) {
    const nome = UI.criar('span', { texto: item.name || '—' });
    return item.protected ? UI.criar('span', {}, [nome, document.createTextNode(' '), UI.selo('protegido')]) : nome;
  }

  function colunas(comTipo) {
    const cols = [
      { titulo: 'Nome', valor: nomeComSelo },
      { titulo: 'PID', valor: (p) => p.pid },
    ];
    if (comTipo) cols.push({ titulo: 'Tipo', valor: (p) => (p.category === 'windows' ? 'Windows' : 'Programa') });
    cols.push(
      { titulo: 'CPU', valor: (p) => porcentagem(p.cpu) },
      { titulo: 'RAM', valor: (p) => memoria(p.ramMb) },
      { titulo: 'GPU', valor: (p) => porcentagem(p.gpu) },
      { titulo: 'Memória de vídeo', valor: (p) => (p.gpuMemMb ? memoria(p.gpuMemMb) : '—') },
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
    );
    return cols;
  }

  // A tabela se reordena a cada leitura; parada enquanto o ponteiro está sobre ela (ou há diálogo
  // aberto) para o clique em "Encerrar" nunca cair em outra linha.
  function tabelaOcupada() {
    return lista.matches(':hover') || listaWindows.matches(':hover') || dialogo.open;
  }

  function desenharListas() {
    const detalhado = dados.mode === 'detalhado';
    barraDetalhe.hidden = !detalhado;
    tituloWindows.hidden = detalhado;
    listaWindows.hidden = detalhado;
    if (detalhado) {
      const termo = campoFiltro.value.trim().toLowerCase();
      const tipo = campoTipo.value;
      const linhas = dados.procs.filter(
        (p) => (tipo === 'todos' || p.category === (tipo === 'windows' ? 'windows' : 'programa')) && (!termo || p.name.toLowerCase().includes(termo) || String(p.pid).includes(termo)),
      );
      tituloLista.textContent = `Processos (${linhas.length})`;
      UI.tabela(lista, colunas(true), linhas, 'Nenhum processo encontrado.');
      listaWindows.replaceChildren();
      return;
    }
    tituloLista.textContent = 'Programas que mais consomem';
    UI.tabela(lista, colunas(false), dados.programs, 'Nenhum programa em destaque.');
    tituloWindows.textContent = 'Processos do Windows que mais consomem';
    UI.tabela(listaWindows, colunas(false), dados.windows, 'Nenhum processo do Windows em destaque.');
  }

  function desenhar() {
    if (!dados) return;
    desenharCartoes();
    desenharGrupos();
    congelada = tabelaOcupada();
    if (!congelada) desenharListas();
  }

  function estado(texto) {
    textoEstado.textContent = texto;
  }

  function agendar() {
    clearTimeout(temporizador);
    temporizador = null;
    if (!ativo || pausado || document.hidden) return;
    temporizador = setTimeout(carregar, Number(campoIntervalo.value));
  }

  async function carregar() {
    if (carregando) return;
    clearTimeout(temporizador);
    carregando = true;
    try {
      const consulta = `mode=${encodeURIComponent(campoModo.value)}&sort=${encodeURIComponent(campoOrdem.value)}`;
      const { status, dados: resposta } = await Painel.api(`/api/monitor?${consulta}`);
      if (status === 200) {
        dados = resposta;
        desenhar();
        estado(`Atualizado às ${new Date(resposta.t).toLocaleTimeString('pt-BR')}${congelada ? ' · tabela parada enquanto o ponteiro está sobre ela' : ''}`);
      } else {
        estado(resposta.error || 'Não foi possível ler os recursos. Tentando de novo.');
      }
    } finally {
      carregando = false;
      agendar();
    }
  }

  function aoMudarOpcao() {
    salvarPreferencias();
    carregar();
  }

  campoModo.addEventListener('change', aoMudarOpcao);
  campoOrdem.addEventListener('change', aoMudarOpcao);
  campoIntervalo.addEventListener('change', () => {
    salvarPreferencias();
    agendar();
  });
  campoFiltro.addEventListener('input', () => dados && desenharListas());
  campoTipo.addEventListener('change', () => dados && desenharListas());
  // Ao tirar o ponteiro de cima, a tabela alcança a leitura mais recente.
  for (const area of [lista, listaWindows]) area.addEventListener('mouseleave', () => dados && !dialogo.open && desenharListas());
  botaoAgora.addEventListener('click', carregar);
  botaoPausar.addEventListener('click', () => {
    pausado = !pausado;
    botaoPausar.textContent = pausado ? 'Continuar' : 'Pausar';
    if (pausado) {
      clearTimeout(temporizador);
      estado('Atualização pausada.');
    } else {
      carregar();
    }
  });
  // Aba do navegador em segundo plano não gasta leitura: pausa e retoma sozinha.
  document.addEventListener('visibilitychange', () => {
    if (!ativo) return;
    if (document.hidden) clearTimeout(temporizador);
    else if (!pausado) carregar();
  });

  lerPreferencias();

  Painel.registrarAba('monitor', {
    mostrar() {
      ativo = true;
      carregar(); // RF-26
    },
    esconder() {
      ativo = false;
      clearTimeout(temporizador);
      temporizador = null;
    },
  });
})();
