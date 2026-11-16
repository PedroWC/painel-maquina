'use strict';

// Aba Tarefas (RF-07 a RF-10, RF-25): lista, executa, para, ativa, desativa,
// cria, edita e exclui tarefas agendadas.

(function () {
  const filtro = document.getElementById('tarefas-filtro');
  const todas = document.getElementById('tarefas-todas');
  const atualizar = document.getElementById('tarefas-atualizar');
  const nova = document.getElementById('tarefas-nova');
  const tabela = document.getElementById('tarefas-tabela');

  let tarefas = [];
  let temporizador = null;

  const GATILHOS = [
    { valor: 'daily', rotulo: 'Diário' },
    { valor: 'weekly', rotulo: 'Semanal' },
    { valor: 'logon', rotulo: 'Ao fazer logon' },
    { valor: 'startup', rotulo: 'Na inicialização' },
    { valor: 'once', rotulo: 'Uma vez' },
    { valor: 'none', rotulo: 'Manual (sem gatilho)' },
  ];
  const DIAS = [
    { valor: 'Monday', rotulo: 'Seg' },
    { valor: 'Tuesday', rotulo: 'Ter' },
    { valor: 'Wednesday', rotulo: 'Qua' },
    { valor: 'Thursday', rotulo: 'Qui' },
    { valor: 'Friday', rotulo: 'Sex' },
    { valor: 'Saturday', rotulo: 'Sáb' },
    { valor: 'Sunday', rotulo: 'Dom' },
  ];

  const data = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');
  const protegida = (t) => t.protected === true; // RN-03: marca vinda do servidor

  function triggerDoFormulario(v) {
    const gatilho = { type: v.trigger };
    if (['daily', 'weekly', 'once'].includes(v.trigger)) gatilho.time = v.time || '03:00';
    if (v.trigger === 'weekly') gatilho.days = v.days;
    return gatilho;
  }

  async function acao(tarefa, op, extra = {}) {
    const { status, dados } = await Painel.api('/api/tasks/action', {
      method: 'POST',
      body: { name: tarefa.name, path: tarefa.path, op, ...extra },
    });
    if (status === 200) Painel.aviso(`Tarefa "${tarefa.name}": operação concluída.`, 'ok');
    else Painel.aviso(dados.error || 'Não foi possível concluir a operação.', 'erro');
    carregar();
  }

  async function excluir(tarefa) {
    const nome = await UI.confirmarNome({
      titulo: 'Excluir tarefa',
      mensagem: 'Esta ação não pode ser desfeita.',
      nome: tarefa.name,
    });
    if (nome) acao(tarefa, 'delete', { confirm: nome });
  }

  function camposAcao(t) {
    return [
      { id: 'command', rotulo: 'Comando', obrigatorio: true, valor: t.command, max: 260 },
      { id: 'args', rotulo: 'Argumentos (opcional)', valor: t.args, max: 1024 },
      { id: 'workdir', rotulo: 'Pasta de trabalho (opcional)', valor: t.workdir, max: 260 },
    ];
  }

  function camposGatilho(valorInicial) {
    return [
      { id: 'trigger', rotulo: 'Gatilho', tipo: 'select', opcoes: valorInicial.opcoes, valor: valorInicial.valor },
      { id: 'time', rotulo: 'Horário', tipo: 'time', valor: '03:00', mostrarSe: (v) => ['daily', 'weekly', 'once'].includes(v.trigger) },
      { id: 'days', rotulo: 'Dias da semana', tipo: 'multi', opcoes: DIAS, valor: ['Monday'], mostrarSe: (v) => v.trigger === 'weekly' },
    ];
  }

  async function criar() {
    const v = await UI.formulario({
      titulo: 'Nova tarefa',
      confirmar: 'Criar',
      campos: [
        { id: 'name', rotulo: 'Nome', obrigatorio: true, max: 200, dica: 'MinhaTarefa' },
        ...camposAcao({ command: '', args: '', workdir: '' }),
        ...camposGatilho({ opcoes: GATILHOS, valor: 'daily' }),
        {
          id: 'runAs',
          rotulo: 'Executar como',
          tipo: 'select',
          valor: 'SYSTEM',
          opcoes: [
            { valor: 'SYSTEM', rotulo: 'Sistema (SYSTEM), roda mesmo sem logon' },
            { valor: 'user', rotulo: 'Meu usuário (somente com logon)' },
          ],
        },
      ],
    });
    if (!v) return;
    const corpo = {
      name: v.name,
      command: v.command,
      args: v.args,
      workdir: v.workdir,
      trigger: triggerDoFormulario(v),
      runAs: v.runAs,
    };
    let { status, dados } = await Painel.api('/api/tasks', { method: 'POST', body: corpo });
    if (status === 409 && /Já existe/.test(dados.error || '')) {
      const substituir = await UI.confirmar({
        titulo: 'Substituir tarefa?',
        mensagem: `Já existe uma tarefa chamada "${v.name}". Deseja substituí-la?`,
        rotulo: 'Substituir',
      });
      if (!substituir) return;
      ({ status, dados } = await Painel.api('/api/tasks', { method: 'POST', body: { ...corpo, replace: true } }));
    }
    if (status === 200) Painel.aviso(`Tarefa "${v.name}" criada.`, 'ok');
    else Painel.aviso(dados.error || 'Não foi possível criar a tarefa.', 'erro');
    carregar();
  }

  async function editar(tarefa) {
    const v = await UI.formulario({
      titulo: `Editar tarefa`,
      confirmar: 'Salvar',
      campos: [
        { id: 'name', rotulo: 'Nome', valor: tarefa.name, somenteLeitura: true },
        ...camposAcao(tarefa),
        ...camposGatilho({ opcoes: [{ valor: 'keep', rotulo: 'Manter gatilhos atuais' }, ...GATILHOS], valor: 'keep' }),
      ],
    });
    if (!v) return;
    const gatilho = v.trigger === 'keep' ? undefined : triggerDoFormulario(v);
    const { status, dados } = await Painel.api('/api/tasks', {
      method: 'PUT',
      body: { name: tarefa.name, path: tarefa.path, command: v.command, args: v.args, workdir: v.workdir, trigger: gatilho },
    });
    if (status === 200) Painel.aviso(`Tarefa "${tarefa.name}" atualizada.`, 'ok');
    else Painel.aviso(dados.error || 'Não foi possível salvar.', 'erro');
    carregar();
  }

  function desenhar() {
    const termo = filtro.value.trim().toLowerCase();
    const linhas = tarefas.filter((t) => !termo || t.name.toLowerCase().includes(termo));
    UI.tabela(
      tabela,
      [
        {
          titulo: 'Nome',
          valor: (t) => {
            const span = UI.criar('span', { texto: t.name });
            return protegida(t) ? UI.criar('span', {}, [span, document.createTextNode(' '), UI.selo('protegida')]) : span;
          },
        },
        { titulo: 'Estado', valor: (t) => UI.selo(t.enabled ? t.state : 'Desativada', t.enabled ? 'ok' : 'off') },
        { titulo: 'Gatilhos', valor: (t) => t.triggers || '—' },
        { titulo: 'Próxima', valor: (t) => data(t.next) },
        { titulo: 'Última (resultado)', valor: (t) => (t.last ? `${data(t.last)} (${t.result})` : '—') },
        { titulo: 'Comando', valor: (t) => `${t.command} ${t.args || ''}`.trim() },
        {
          titulo: 'Ações',
          valor: (t) => {
            const bloqueada = protegida(t);
            return UI.acoes(
              UI.botao('Executar', { aoClicar: () => acao(t, 'run') }),
              UI.botao(t.enabled ? 'Desativar' : 'Ativar', {
                aoClicar: () => acao(t, t.enabled ? 'disable' : 'enable'),
                desabilitado: bloqueada && t.enabled,
              }),
              UI.botao('Editar', { aoClicar: () => editar(t), desabilitado: bloqueada }),
              UI.botao('Excluir', { classe: 'mini perigo', aoClicar: () => excluir(t), desabilitado: bloqueada }),
            );
          },
        },
      ],
      linhas,
      'Nenhuma tarefa encontrada.',
    );
  }

  async function carregar() {
    const { status, dados } = await Painel.api(`/api/tasks${todas.checked ? '?all=1' : ''}`);
    if (status !== 200) return Painel.aviso(dados.error || 'Não foi possível listar as tarefas.', 'erro');
    tarefas = dados.tasks;
    return desenhar();
  }

  filtro.addEventListener('input', desenhar);
  todas.addEventListener('change', carregar);
  atualizar.addEventListener('click', carregar);
  nova.addEventListener('click', criar);

  Painel.registrarAba('tarefas', {
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
