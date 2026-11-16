'use strict';

// Componentes reutilizáveis: tabela, botões e diálogos (formulário, confirmação
// e confirmação por nome, RN-05). Todo texto entra com textContent.

(function () {
  const dialogo = document.getElementById('dialogo');

  function criar(tag, propriedades = {}, filhos = []) {
    const elemento = document.createElement(tag);
    for (const [chave, valor] of Object.entries(propriedades)) {
      if (chave === 'texto') elemento.textContent = valor;
      else if (chave === 'classe') elemento.className = valor;
      else if (valor !== undefined) elemento.setAttribute(chave, valor);
    }
    for (const filho of filhos) elemento.appendChild(filho);
    return elemento;
  }

  function botao(texto, { classe = 'mini', aoClicar, desabilitado = false, rotulo } = {}) {
    const el = criar('button', { type: 'button', texto, classe });
    el.disabled = desabilitado;
    if (rotulo) el.setAttribute('aria-label', rotulo);
    if (aoClicar) el.addEventListener('click', aoClicar);
    return el;
  }

  // colunas: [{ titulo, valor: (linha) => texto | Node }]
  function tabela(container, colunas, linhas, vazio = 'Nada para mostrar.') {
    container.replaceChildren();
    if (linhas.length === 0) {
      container.appendChild(criar('p', { classe: 'vazio', texto: vazio }));
      return;
    }
    const cabecalho = criar('tr', {}, colunas.map((c) => criar('th', { scope: 'col', texto: c.titulo })));
    const corpo = criar('tbody');
    for (const linha of linhas) {
      const tr = criar('tr');
      for (const coluna of colunas) {
        const valor = coluna.valor(linha);
        const td = criar('td');
        if (valor instanceof Node) td.appendChild(valor);
        else td.textContent = valor === null || valor === undefined ? '' : String(valor);
        tr.appendChild(td);
      }
      corpo.appendChild(tr);
    }
    const envoltorio = criar('div', { classe: 'tabela-rolavel' }, [
      criar('table', {}, [criar('thead', {}, [cabecalho]), corpo]),
    ]);
    container.appendChild(envoltorio);
  }

  function selo(texto, classe = '') {
    return criar('span', { classe: `selo-mini ${classe}`.trim(), texto });
  }

  function acoes(...botoes) {
    return criar('div', { classe: 'acoes' }, botoes);
  }

  function abrir(conteudo, aoFechar) {
    dialogo.replaceChildren(conteudo);
    dialogo.onclose = () => aoFechar(dialogo.returnValue);
    dialogo.showModal();
  }

  // campos: [{ id, rotulo, tipo: text|select|time|multi, valor, opcoes, obrigatorio, dica, somenteLeitura, mostrarSe }]
  function formulario({ titulo, campos, confirmar = 'Salvar', mensagem }) {
    return new Promise((resolve) => {
      const form = criar('form', { method: 'dialog', classe: 'dialogo-form' });
      form.appendChild(criar('h2', { texto: titulo }));
      if (mensagem) form.appendChild(criar('p', { classe: 'dica', texto: mensagem }));
      const entradas = {};
      const blocos = {};

      for (const campo of campos) {
        const bloco = criar('div', { classe: 'campo' });
        const rotulo = criar('label', { for: `campo-${campo.id}`, texto: campo.rotulo });
        bloco.appendChild(rotulo);
        let entrada;
        if (campo.tipo === 'select') {
          entrada = criar('select', { id: `campo-${campo.id}` });
          for (const opcao of campo.opcoes) {
            const o = criar('option', { value: opcao.valor, texto: opcao.rotulo });
            if (opcao.valor === campo.valor) o.selected = true;
            entrada.appendChild(o);
          }
        } else if (campo.tipo === 'multi') {
          entrada = criar('div', { classe: 'multi', id: `campo-${campo.id}`, role: 'group', 'aria-label': campo.rotulo });
          for (const opcao of campo.opcoes) {
            const caixa = criar('input', { type: 'checkbox', value: opcao.valor });
            caixa.checked = (campo.valor || []).includes(opcao.valor);
            entrada.appendChild(criar('label', { classe: 'inline' }, [caixa, document.createTextNode(` ${opcao.rotulo}`)]));
          }
        } else {
          entrada = criar('input', { id: `campo-${campo.id}`, type: campo.tipo || 'text', maxlength: campo.max || 260 });
          entrada.value = campo.valor || '';
          if (campo.obrigatorio) entrada.required = true;
          if (campo.somenteLeitura) entrada.readOnly = true;
          if (campo.dica) entrada.setAttribute('placeholder', campo.dica);
        }
        entradas[campo.id] = entrada;
        bloco.appendChild(entrada);
        blocos[campo.id] = bloco;
        form.appendChild(bloco);
      }

      const valores = () => {
        const saida = {};
        for (const campo of campos) {
          const entrada = entradas[campo.id];
          saida[campo.id] =
            campo.tipo === 'multi'
              ? [...entrada.querySelectorAll('input:checked')].map((i) => i.value)
              : entrada.value;
        }
        return saida;
      };
      const atualizar = () => {
        const atual = valores();
        for (const campo of campos) {
          if (campo.mostrarSe) blocos[campo.id].hidden = !campo.mostrarSe(atual);
        }
      };
      form.addEventListener('input', atualizar);
      form.addEventListener('change', atualizar);
      atualizar();

      let resultado = null;
      const cancelar = criar('button', { type: 'submit', value: 'cancelar', texto: 'Cancelar', formnovalidate: '' });
      const ok = criar('button', { type: 'submit', value: 'ok', classe: 'primario-inline', texto: confirmar });
      form.appendChild(criar('div', { classe: 'dialogo-fim' }, [cancelar, ok]));
      form.addEventListener('submit', (evento) => {
        if (evento.submitter && evento.submitter.value === 'ok') resultado = valores();
      });
      abrir(form, (retorno) => resolve(retorno === 'ok' ? resultado : null));
    });
  }

  // Confirmação simples.
  function confirmar({ titulo, mensagem, rotulo = 'Confirmar', perigo = true }) {
    return new Promise((resolve) => {
      const form = criar('form', { method: 'dialog', classe: 'dialogo-form' }, [
        criar('h2', { texto: titulo }),
        criar('p', { texto: mensagem }),
        criar('div', { classe: 'dialogo-fim' }, [
          criar('button', { type: 'submit', value: 'cancelar', texto: 'Cancelar' }),
          criar('button', { type: 'submit', value: 'ok', classe: perigo ? 'perigo' : 'primario-inline', texto: rotulo }),
        ]),
      ]);
      abrir(form, (retorno) => resolve(retorno === 'ok'));
    });
  }

  // RN-05: só habilita o botão depois de digitar o nome do recurso. Devolve o nome digitado ou null.
  function confirmarNome({ titulo, mensagem, nome, rotulo = 'Excluir' }) {
    return new Promise((resolve) => {
      const entrada = criar('input', { type: 'text', 'aria-label': 'Confirmar nome', autocomplete: 'off' });
      const confirmarBotao = criar('button', { type: 'submit', value: 'ok', classe: 'perigo', texto: rotulo });
      confirmarBotao.disabled = true;
      entrada.addEventListener('input', () => {
        confirmarBotao.disabled = entrada.value !== nome;
      });
      const alvo = criar('strong', { texto: nome });
      const form = criar('form', { method: 'dialog', classe: 'dialogo-form' }, [
        criar('h2', { texto: titulo }),
        criar('p', { texto: mensagem }),
        criar('p', {}, [document.createTextNode('Digite '), alvo, document.createTextNode(' para confirmar:')]),
        entrada,
        criar('div', { classe: 'dialogo-fim' }, [
          criar('button', { type: 'submit', value: 'cancelar', texto: 'Cancelar' }),
          confirmarBotao,
        ]),
      ]);
      abrir(form, (retorno) => resolve(retorno === 'ok' && entrada.value === nome ? entrada.value : null));
    });
  }

  // Mostra um texto longo (por exemplo, logs) com botão para atualizar. obter: async () => texto.
  function visualizador({ titulo, obter }) {
    return new Promise((resolve) => {
      const area = criar('pre', { classe: 'visualizador', tabindex: '0', texto: 'Carregando…' });
      const carregar = async () => {
        try {
          area.textContent = (await obter()) || '(sem saída)';
        } catch (erro) {
          area.textContent = erro.message || 'Não foi possível carregar.';
        }
        area.scrollTop = area.scrollHeight;
      };
      const atualizar = criar('button', { type: 'button', texto: 'Atualizar' });
      atualizar.addEventListener('click', carregar);
      const form = criar('form', { method: 'dialog', classe: 'dialogo-form largo' }, [
        criar('h2', { texto: titulo }),
        area,
        criar('div', { classe: 'dialogo-fim' }, [atualizar, criar('button', { type: 'submit', texto: 'Fechar' })]),
      ]);
      abrir(form, () => resolve());
      carregar();
    });
  }

  window.UI = { criar, botao, tabela, selo, acoes, formulario, confirmar, confirmarNome, visualizador };
})();
