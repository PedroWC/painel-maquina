'use strict';

// Aba Terminais (RF-03 a RF-06): lista de sessões, terminal xterm.js ligado por
// WebSocket, reanexação com histórico e confirmação antes de encerrar.

(function () {
  const seletorShell = document.getElementById('term-shell');
  const campoPasta = document.getElementById('term-pasta');
  const campoNome = document.getElementById('term-nome');
  const botaoNova = document.getElementById('term-nova');
  const listaSessoes = document.getElementById('term-sessoes');
  const msgVazio = document.getElementById('term-vazio');
  const areaTerminal = document.getElementById('term-area');
  const avisoTerminal = document.getElementById('term-aviso');
  const container = document.getElementById('term-container');

  let sessoes = [];
  let selecionada = null;
  let terminal = null;
  let encaixe = null;
  let socket = null;
  let observador = null;
  let temporizador = null;

  function mensagemAviso(texto) {
    avisoTerminal.hidden = !texto;
    avisoTerminal.textContent = texto || '';
  }

  function desconectar() {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    if (observador) {
      observador.disconnect();
      observador = null;
    }
    if (terminal) {
      terminal.dispose();
      terminal = null;
    }
    encaixe = null;
    container.replaceChildren();
  }

  function enviar(mensagem) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
  }

  function ajustar() {
    if (!encaixe || !terminal) return;
    try {
      encaixe.fit();
      enviar({ t: 'r', cols: terminal.cols, rows: terminal.rows });
    } catch {
      // o contêiner pode estar oculto no momento
    }
  }

  function conectar(id) {
    desconectar();
    mensagemAviso('');
    terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      fontSize: 14,
      scrollback: 5000,
      theme: { background: '#000000' },
    });
    encaixe = new FitAddon.FitAddon();
    terminal.loadAddon(encaixe);
    terminal.open(container);
    terminal.onData((dados) => enviar({ t: 'i', d: dados }));

    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${protocolo}://${location.host}/ws/term?id=${encodeURIComponent(id)}`);
    socket.onopen = () => {
      ajustar();
      terminal.focus();
    };
    socket.onmessage = (evento) => {
      let mensagem;
      try {
        mensagem = JSON.parse(evento.data);
      } catch {
        return;
      }
      if (mensagem.t === 'b' || mensagem.t === 'o') terminal.write(mensagem.d);
      if (mensagem.t === 'x') {
        mensagemAviso(`Sessão finalizada (código de saída ${mensagem.c === null ? 'desconhecido' : mensagem.c}).`);
        carregar();
      }
    };
    socket.onclose = () => {
      const atual = sessoes.find((s) => s.id === id);
      if (atual && !atual.exited) {
        mensagemAviso('Conexão perdida. A sessão continua ativa no servidor; selecione-a novamente para reconectar.');
      }
    };
    observador = new ResizeObserver(() => ajustar());
    observador.observe(container);
  }

  function selecionar(id) {
    selecionada = id;
    desenharSessoes();
    if (id) conectar(id);
    else desconectar();
  }

  function criarBotao(texto, classe, aoClicar, rotulo) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = texto;
    if (classe) botao.className = classe;
    if (rotulo) botao.setAttribute('aria-label', rotulo);
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation();
      aoClicar();
    });
    return botao;
  }

  function desenharSessoes() {
    listaSessoes.replaceChildren();
    msgVazio.hidden = sessoes.length > 0;
    areaTerminal.hidden = !selecionada;
    for (const sessao of sessoes) {
      const item = document.createElement('div');
      item.className = `sessao${sessao.id === selecionada ? ' ativa' : ''}${sessao.exited ? ' finalizada' : ''}`;
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(sessao.id === selecionada));
      item.tabIndex = 0;

      const titulo = document.createElement('span');
      titulo.className = 'sessao-titulo';
      titulo.textContent = `${sessao.name} · ${sessao.shell}${sessao.admin ? ' · admin' : ''}${sessao.exited ? ' · finalizada' : ''}`;
      item.appendChild(titulo);
      item.appendChild(criarBotao('Renomear', 'mini', () => renomear(sessao), `Renomear ${sessao.name}`));
      item.appendChild(
        criarBotao(sessao.exited ? 'Remover' : 'Encerrar', 'mini perigo', () => encerrar(sessao), `Encerrar ${sessao.name}`),
      );
      item.addEventListener('click', () => selecionar(sessao.id));
      item.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          selecionar(sessao.id);
        }
      });
      listaSessoes.appendChild(item);
    }
  }

  async function carregar() {
    const { status, dados } = await Painel.api('/api/terminals');
    if (status !== 200) return;
    sessoes = dados.terminals;
    if (seletorShell.options.length === 0) {
      for (const shell of dados.shells) {
        const opcao = document.createElement('option');
        opcao.value = shell.id;
        opcao.textContent = shell.label;
        seletorShell.appendChild(opcao);
      }
    }
    if (selecionada && !sessoes.some((s) => s.id === selecionada)) {
      selecionada = null;
      desconectar();
    }
    desenharSessoes();
  }

  async function criar() {
    botaoNova.disabled = true;
    const { status, dados } = await Painel.api('/api/terminals', {
      method: 'POST',
      body: {
        shell: seletorShell.value,
        cwd: campoPasta.value,
        name: campoNome.value,
        cols: terminal ? terminal.cols : 120,
        rows: terminal ? terminal.rows : 30,
      },
    });
    botaoNova.disabled = false;
    if (status !== 200) return Painel.aviso(dados.error || 'Não foi possível abrir a sessão.', 'erro');
    if (dados.cwdFallback) Painel.aviso('Pasta não encontrada: usando a pasta padrão do usuário.', 'info');
    campoNome.value = '';
    await carregar();
    return selecionar(dados.id);
  }

  async function renomear(sessao) {
    const novo = window.prompt('Novo nome da sessão:', sessao.name);
    if (novo === null || novo.trim() === '') return;
    const { status, dados } = await Painel.api(`/api/terminals/${sessao.id}/rename`, {
      method: 'POST',
      body: { name: novo.trim() },
    });
    if (status !== 200) Painel.aviso(dados.error || 'Não foi possível renomear.', 'erro');
    carregar();
  }

  async function encerrar(sessao) {
    const pergunta = sessao.exited
      ? `Remover a sessão "${sessao.name}" da lista?`
      : `Encerrar a sessão "${sessao.name}"? O shell e os processos dele serão finalizados.`;
    if (!window.confirm(pergunta)) return;
    const { status, dados } = await Painel.api(`/api/terminals/${sessao.id}`, { method: 'DELETE' });
    if (status !== 200) Painel.aviso(dados.error || 'Não foi possível encerrar.', 'erro');
    if (selecionada === sessao.id) selecionar(null);
    carregar();
  }

  botaoNova.addEventListener('click', criar);

  // Outras abas (por exemplo, WSL) pedem para abrir uma sessão já criada.
  let pendente = null;
  Painel.abrirTerminal = (id) => {
    pendente = id;
    Painel.abrirAba('terminais');
  };

  Painel.registrarAba('terminais', {
    async mostrar() {
      await carregar();
      if (pendente) {
        selecionar(pendente);
        pendente = null;
      } else if (!selecionada && sessoes.length > 0) selecionar(sessoes[0].id);
      // RF-26: atualiza a lista periodicamente (não mexe no terminal aberto)
      temporizador = setInterval(carregar, 10000);
    },
    esconder() {
      clearInterval(temporizador);
      temporizador = null;
      selecionada = null;
      desconectar();
    },
  });
})();
