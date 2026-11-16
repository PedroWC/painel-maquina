'use strict';

// Aba Serviços (RF-11 a RF-14, RF-25): lista, inicia, para, reinicia, altera a
// inicialização, cria, edita e exclui serviços do Windows.

(function () {
  const filtro = document.getElementById('servicos-filtro');
  const estado = document.getElementById('servicos-estado');
  const atualizar = document.getElementById('servicos-atualizar');
  const novo = document.getElementById('servicos-novo');
  const tabela = document.getElementById('servicos-tabela');

  let servicos = [];
  let temporizador = null;

  const INICIALIZACAO = [
    { valor: 'auto', rotulo: 'Automático' },
    { valor: 'manual', rotulo: 'Manual' },
    { valor: 'disabled', rotulo: 'Desativado' },
  ];
  const MODO = { Auto: 'auto', Manual: 'manual', Disabled: 'disabled' };
  const ROTULO_ESTADO = { Running: 'Em execução', Stopped: 'Parado', Paused: 'Pausado', StartPending: 'Iniciando', StopPending: 'Parando' };

  // O servidor pede "confirmação reforçada" quando necessário (RN-05); a interface só reage ao pedido.
  async function comConfirmacao(enviar, servico, op) {
    let resposta = await enviar();
    if (resposta.status === 400 && /Confirmação inválida/.test(resposta.dados.error || '')) {
      const nome = await UI.confirmarNome({
        titulo: op === 'delete' ? 'Excluir serviço' : 'Confirmação reforçada',
        mensagem: op === 'delete' ? 'Esta ação não pode ser desfeita.' : 'Esta operação pode interromper o acesso à máquina.',
        nome: servico.name,
        rotulo: op === 'delete' ? 'Excluir' : 'Confirmar',
      });
      if (!nome) return null;
      resposta = await enviar(nome);
    }
    return resposta;
  }

  async function acao(servico, op) {
    const resposta = await comConfirmacao(
      (confirm) =>
        Painel.api('/api/services/action', { method: 'POST', body: { name: servico.name, op, confirm } }),
      servico,
      op,
    );
    if (resposta) {
      if (resposta.status === 200) Painel.aviso(`Serviço "${servico.name}": operação concluída.`, 'ok');
      else Painel.aviso(resposta.dados.error || 'Não foi possível concluir a operação.', 'erro');
    }
    carregar();
  }

  function campos(valores) {
    return [
      { id: 'display', rotulo: 'Nome de exibição (opcional)', valor: valores.display, max: 256 },
      { id: 'desc', rotulo: 'Descrição (opcional)', valor: valores.desc, max: 1024 },
    ];
  }

  async function criar() {
    const v = await UI.formulario({
      titulo: 'Novo serviço',
      confirmar: 'Criar',
      mensagem: 'O executável precisa ser um programa preparado para rodar como serviço do Windows.',
      campos: [
        { id: 'name', rotulo: 'Nome do serviço', obrigatorio: true, max: 256, dica: 'meu-servico' },
        { id: 'path', rotulo: 'Executável e argumentos', obrigatorio: true, max: 1024, dica: 'C:\\apps\\meu-servico.exe' },
        ...campos({ display: '', desc: '' }),
        { id: 'start', rotulo: 'Inicialização', tipo: 'select', opcoes: INICIALIZACAO, valor: 'auto' },
      ],
    });
    if (!v) return;
    const { status, dados } = await Painel.api('/api/services', { method: 'POST', body: v });
    if (status === 200) Painel.aviso(`Serviço "${v.name}" criado.`, 'ok');
    else Painel.aviso(dados.error || 'Não foi possível criar o serviço.', 'erro');
    carregar();
  }

  async function editar(servico) {
    const v = await UI.formulario({
      titulo: 'Editar serviço',
      confirmar: 'Salvar',
      campos: [
        { id: 'name', rotulo: 'Nome do serviço', valor: servico.name, somenteLeitura: true },
        { id: 'path', rotulo: 'Executável e argumentos (vazio mantém o atual)', valor: '', max: 1024, dica: servico.path || '' },
        ...campos({ display: servico.display, desc: servico.desc || '' }),
        {
          id: 'start',
          rotulo: 'Inicialização',
          tipo: 'select',
          opcoes: [{ valor: 'keep', rotulo: 'Manter atual' }, ...INICIALIZACAO],
          valor: 'keep',
        },
      ],
    });
    if (!v) return;
    const corpo = { name: servico.name, path: v.path, display: v.display, desc: v.desc };
    if (v.start !== 'keep') corpo.start = v.start;
    const resposta = await comConfirmacao(
      (confirm) => Painel.api('/api/services', { method: 'PUT', body: { ...corpo, confirm } }),
      servico,
      'edit',
    );
    if (resposta) {
      if (resposta.status === 200) Painel.aviso(`Serviço "${servico.name}" atualizado.`, 'ok');
      else Painel.aviso(resposta.dados.error || 'Não foi possível salvar.', 'erro');
    }
    carregar();
  }

  function desenhar() {
    const termo = filtro.value.trim().toLowerCase();
    const filtroEstado = estado.value;
    const linhas = servicos.filter(
      (s) =>
        (!termo || s.name.toLowerCase().includes(termo) || (s.display || '').toLowerCase().includes(termo)) &&
        (!filtroEstado || s.state === filtroEstado),
    );
    UI.tabela(
      tabela,
      [
        {
          titulo: 'Serviço',
          valor: (s) => {
            const nome = UI.criar('strong', { texto: s.name });
            const bloco = UI.criar('div', {}, [nome]);
            if (s.critical) bloco.append(' ', UI.selo('crítico'));
            if (s.display && s.display !== s.name) bloco.appendChild(UI.criar('div', { classe: 'secundario', texto: s.display }));
            return bloco;
          },
        },
        { titulo: 'Estado', valor: (s) => UI.selo(ROTULO_ESTADO[s.state] || s.state, s.state === 'Running' ? 'ok' : 'off') },
        {
          titulo: 'Inicialização',
          valor: (s) => {
            const modo = MODO[s.start];
            if (!modo) return s.start;
            const seletor = UI.criar('select', { 'aria-label': `Inicialização de ${s.name}` });
            for (const opcao of INICIALIZACAO) {
              const o = UI.criar('option', { value: opcao.valor, texto: opcao.rotulo });
              if (opcao.valor === modo) o.selected = true;
              seletor.appendChild(o);
            }
            seletor.disabled = s.critical;
            seletor.addEventListener('change', () => acao(s, seletor.value));
            return seletor;
          },
        },
        { titulo: 'Conta', valor: (s) => s.user || '—' },
        { titulo: 'Caminho', valor: (s) => UI.criar('span', { classe: 'caminho', texto: s.path || '—', title: s.path || '' }) },
        {
          titulo: 'Ações',
          valor: (s) => {
            const rodando = s.state === 'Running';
            return UI.acoes(
              UI.botao(rodando ? 'Parar' : 'Iniciar', {
                aoClicar: () => acao(s, rodando ? 'stop' : 'start'),
                desabilitado: s.critical && rodando,
              }),
              UI.botao('Reiniciar', { aoClicar: () => acao(s, 'restart'), desabilitado: s.critical || !rodando }),
              UI.botao('Editar', { aoClicar: () => editar(s), desabilitado: s.critical }),
              UI.botao('Excluir', { classe: 'mini perigo', aoClicar: () => acao(s, 'delete'), desabilitado: s.critical }),
            );
          },
        },
      ],
      linhas,
      'Nenhum serviço encontrado.',
    );
  }

  async function carregar() {
    const { status, dados } = await Painel.api('/api/services');
    if (status !== 200) return Painel.aviso(dados.error || 'Não foi possível listar os serviços.', 'erro');
    servicos = dados.services;
    return desenhar();
  }

  filtro.addEventListener('input', desenhar);
  estado.addEventListener('change', desenhar);
  atualizar.addEventListener('click', carregar);
  novo.addEventListener('click', criar);

  Painel.registrarAba('servicos', {
    mostrar() {
      carregar();
      temporizador = setInterval(carregar, 15000); // RF-26
    },
    esconder() {
      clearInterval(temporizador);
      temporizador = null;
    },
  });
})();
