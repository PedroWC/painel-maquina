'use strict';

// Provedores (RF-15, RF-16, RF-23; RN-05, RN-11, RN-13): a aba de status e as abas
// de cada tecnologia detectada, montadas dinamicamente a partir de /api/providers.
// O mesmo renderizador serve Docker, pm2, Kubernetes e qualquer provedor futuro.

(function () {
  const botaoDetectar = document.getElementById('provedores-detectar');
  const tabelaStatus = document.getElementById('provedores-tabela');
  const abasDinamicas = new Map(); // id do provedor -> { nome, botao, secao }

  const quando = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR') : '—');

  function descricaoExtra(provedor) {
    if (provedor.info && typeof provedor.info.motor === 'boolean') {
      return `Motor: ${provedor.info.motor ? 'em execução' : 'parado'}`;
    }
    return '';
  }

  function desenharStatus(provedores) {
    UI.tabela(
      tabelaStatus,
      [
        { titulo: 'Tecnologia', valor: (p) => p.nome },
        {
          titulo: 'Estado',
          valor: (p) => {
            if (p.disponivel) return UI.selo('Disponível', 'ok');
            if (p.erro) return UI.criar('span', { classe: 'selo-mini mau', texto: 'Erro na detecção', title: p.erro });
            return UI.selo('Não encontrado', 'off');
          },
        },
        { titulo: 'Versão', valor: (p) => p.versao || '—' },
        { titulo: 'Detalhes', valor: (p) => descricaoExtra(p) || '—' },
        { titulo: 'Verificado em', valor: (p) => quando(p.verificadoEm) },
      ],
      provedores,
      'Nenhum provedor conhecido.',
    );
  }

  function celula(linha, coluna) {
    const valor = linha.cells[coluna.key];
    return valor === undefined || valor === null ? '—' : valor;
  }

  // estado: valores atuais dos seletores da aba (por exemplo, contexto e namespace do Kubernetes);
  // viajam junto de cada ação e consulta de logs para que valham exatamente o que a tela mostra.
  async function executar(provedor, meta, op, linha, estado) {
    const definicao = meta.acoes[op];
    const nome = (linha.cells && linha.cells.nome) || linha.id;
    const params = { ...estado };

    // Ações com parâmetros próprios (por exemplo, número de réplicas) pedem um formulário antes.
    if (definicao.campos && definicao.campos.length > 0) {
      const valores = await UI.formulario({
        titulo: `${definicao.rotulo}: ${nome}`,
        confirmar: definicao.rotulo,
        campos: definicao.campos.map((c) => ({
          id: c.id,
          rotulo: c.rotulo,
          obrigatorio: true,
          max: c.max || 260,
          valor: (linha.padroes && linha.padroes[c.id]) || '',
        })),
      });
      if (!valores) return false;
      for (const c of definicao.campos) params[c.id] = c.inteiro ? Number(valores[c.id]) : valores[c.id];
    }

    let confirm;
    if (definicao.destrutiva) {
      if (definicao.confirmarNome || meta.confirmaPorNome) {
        // RN-13: digitar o nome do recurso (o provedor pode definir um texto mais curto que o id).
        confirm = await UI.confirmarNome({
          titulo: `${definicao.rotulo}: ${provedor.nome}`,
          mensagem: 'Esta operação é destrutiva.',
          nome: linha.nomeConfirmacao || linha.id,
          rotulo: definicao.rotulo,
        });
        if (!confirm) return false;
      } else {
        const ok = await UI.confirmar({
          titulo: definicao.rotulo,
          mensagem: `${definicao.rotulo} "${nome}"?`,
          rotulo: definicao.rotulo,
        });
        if (!ok) return false;
      }
    }
    const { status, dados } = await Painel.api(`/api/p/${provedor.id}/action`, {
      method: 'POST',
      body: { op, id: linha.id, confirm, params },
    });
    if (status === 200) Painel.aviso(`${provedor.nome}: ${definicao.rotulo.toLowerCase()} concluído para "${nome}".`, 'ok');
    else Painel.aviso(dados.error || 'Não foi possível concluir a operação.', 'erro');
    return true;
  }

  function verLogs(provedor, linha, estado) {
    const nome = (linha.cells && linha.cells.nome) || linha.id;
    return UI.visualizador({
      titulo: `Logs: ${nome}`,
      obter: async () => {
        const consulta = new URLSearchParams({ ...estado, id: linha.id });
        const { status, dados } = await Painel.api(`/api/p/${provedor.id}/logs?${consulta}`);
        if (status !== 200) throw new Error(dados.error || 'Não foi possível obter os logs.');
        return dados.text;
      },
    });
  }

  function desenharSecoes(provedor, resposta, conteudo, recarregar, estado) {
    conteudo.replaceChildren();
    if (resposta.contexto) conteudo.appendChild(UI.criar('div', { classe: 'banner', texto: resposta.contexto }));
    // Problema não fatal (por exemplo, cluster fora do ar): a aba segue com os seletores para trocar de contexto.
    if (resposta.aviso) conteudo.appendChild(UI.criar('p', { classe: 'erro-aba', role: 'alert', texto: resposta.aviso }));
    for (const secao of resposta.sections || []) {
      conteudo.appendChild(UI.criar('h2', { classe: 'subtitulo', texto: secao.title }));
      const destino = UI.criar('div');
      conteudo.appendChild(destino);
      const temEstado = secao.rows.some((l) => l.status);
      const colunas = secao.columns.map((c) => ({ titulo: c.title, valor: (l) => celula(l, c) }));
      if (temEstado) {
        colunas.splice(1, 0, {
          titulo: 'Estado',
          valor: (l) => (l.status ? UI.selo(l.status.texto, l.status.tom) : '—'),
        });
      }
      colunas.push({
        titulo: 'Ações',
        valor: (l) => {
          const botoes = (l.actions || [])
            .filter((op) => resposta.acoes[op])
            .map((op) =>
              UI.botao(resposta.acoes[op].rotulo, {
                classe: resposta.acoes[op].destrutiva ? 'mini perigo' : 'mini',
                aoClicar: async () => {
                  if (await executar(provedor, resposta, op, l, estado)) recarregar();
                },
              }),
            );
          if (l.logs && resposta.temLogs) botoes.push(UI.botao('Logs', { aoClicar: () => verLogs(provedor, l, estado) }));
          return UI.acoes(...botoes);
        },
      });
      UI.tabela(destino, colunas, secao.rows, secao.empty || 'Nada para mostrar.');
    }
  }

  function criarAba(provedor) {
    const nomeAba = `p-${provedor.id}`;
    const botao = UI.criar('button', { type: 'button', classe: 'aba', 'data-aba': nomeAba, texto: provedor.nome });
    const conteudo = UI.criar('div');
    const atualizar = UI.criar('button', { type: 'button', texto: 'Atualizar' });
    const seletores = UI.criar('div', { classe: 'barra' });
    const estado = {}; // valores dos seletores (contexto, namespace...), sempre os que o servidor resolveu
    let assinatura = '';
    const secao = UI.criar('section', { id: `aba-${nomeAba}`, classe: 'painel-aba', hidden: '' }, [
      UI.criar('h1', { classe: 'titulo-aba', texto: provedor.nome }),
      UI.criar('div', { classe: 'barra' }, [atualizar]),
      seletores,
      conteudo,
    ]);
    document.getElementById('abas').appendChild(botao);
    document.querySelector('main').appendChild(secao);

    let temporizador = null;

    // Os seletores só são recriados quando mudam (a atualização periódica não pode fechar uma lista aberta).
    function atualizarSeletores(controles) {
      for (const c of controles) estado[c.id] = c.valor;
      const nova = JSON.stringify(controles);
      if (nova === assinatura) return;
      assinatura = nova;
      seletores.replaceChildren();
      for (const c of controles) {
        const lista = UI.criar('select', { id: `sel-${provedor.id}-${c.id}`, 'aria-label': c.rotulo });
        for (const opcao of c.opcoes) {
          const o = UI.criar('option', { value: opcao.valor, texto: opcao.rotulo });
          if (opcao.valor === c.valor) o.selected = true;
          lista.appendChild(o);
        }
        lista.addEventListener('change', () => {
          estado[c.id] = lista.value;
          for (const outro of c.reinicia || []) delete estado[outro]; // por exemplo, trocar o contexto volta ao namespace padrão
          carregar();
        });
        seletores.appendChild(UI.criar('label', { classe: 'inline', texto: `${c.rotulo} ` }, [lista]));
      }
    }

    async function carregar() {
      const { status, dados } = await Painel.api(`/api/p/${provedor.id}/items?${new URLSearchParams(estado)}`);
      if (status === 200) {
        atualizarSeletores(dados.controles || []);
        return desenharSecoes(provedor, dados, conteudo, carregar, estado);
      }
      // UC-10 (exceção A) e RN-14: o erro fica só nesta aba, com a mensagem amigável.
      conteudo.replaceChildren(UI.criar('p', { classe: 'erro-aba', role: 'alert', texto: dados.error || 'Não foi possível carregar.' }));
      return undefined;
    }
    atualizar.addEventListener('click', carregar);

    Painel.registrarAba(nomeAba, {
      mostrar() {
        carregar();
        temporizador = setInterval(carregar, 10000); // RF-26
      },
      esconder() {
        clearInterval(temporizador);
        temporizador = null;
      },
    });
    abasDinamicas.set(provedor.id, { nomeAba, botao, secao });
  }

  // RN-11: só existem abas de provedores disponíveis; instalar ou remover a ferramenta reflete aqui.
  function sincronizar(provedores) {
    for (const provedor of provedores) {
      const existente = abasDinamicas.get(provedor.id);
      if (provedor.disponivel && !existente) criarAba(provedor);
      if (!provedor.disponivel && existente) {
        Painel.removerAba(existente.nomeAba);
        existente.botao.remove();
        existente.secao.remove();
        abasDinamicas.delete(provedor.id);
      }
    }
  }

  async function carregarStatus(forcar = false) {
    const { status, dados } = await Painel.api('/api/providers' + (forcar ? '/refresh' : ''), forcar ? { method: 'POST' } : {});
    if (status !== 200) return Painel.aviso(dados.error || 'Não foi possível consultar os provedores.', 'erro');
    desenharStatus(dados.providers);
    sincronizar(dados.providers);
    return dados.providers;
  }

  botaoDetectar.addEventListener('click', () => carregarStatus(true));

  Painel.registrarAba('provedores', { mostrar: () => carregarStatus(false) });
  Painel.aoAutenticar(() => carregarStatus(false));
})();
