'use strict';

// Núcleo da interface: sessão (login/logout), navegação por abas, chamadas à
// API e avisos. Todo texto vindo do servidor entra como texto puro (textContent), nunca como HTML.

(function () {
  const telaLogin = document.getElementById('tela-login');
  const telaApp = document.getElementById('tela-app');
  const formLogin = document.getElementById('form-login');
  const campoToken = document.getElementById('token');
  const msgLogin = document.getElementById('msg-login');
  const abas = {};
  let abaAtual = null;

  async function api(caminho, opcoes = {}) {
    const resposta = await fetch(caminho, {
      method: opcoes.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'painel' },
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      credentials: 'same-origin',
    });
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.status === 401 && caminho !== '/api/login' && caminho !== '/api/me') mostrarLogin();
    return { status: resposta.status, dados };
  }

  function aviso(texto, tipo = 'info') {
    const item = document.createElement('div');
    item.className = `aviso-item ${tipo}`;
    item.textContent = texto;
    document.getElementById('avisos').appendChild(item);
    setTimeout(() => item.remove(), 6000);
  }

  function registrarAba(nome, aba) {
    abas[nome] = aba;
  }

  function abrirAba(nome) {
    if (!abas[nome]) return;
    if (abaAtual && abas[abaAtual] && abas[abaAtual].esconder) abas[abaAtual].esconder();
    abaAtual = nome;
    document.querySelectorAll('.aba').forEach((botao) => {
      botao.classList.toggle('ativa', botao.dataset.aba === nome);
      botao.setAttribute('aria-current', botao.dataset.aba === nome ? 'page' : 'false');
    });
    document.querySelectorAll('.painel-aba').forEach((secao) => {
      secao.hidden = secao.id !== `aba-${nome}`;
    });
    if (abas[nome].mostrar) abas[nome].mostrar();
  }

  function mostrarLogin() {
    if (abaAtual && abas[abaAtual] && abas[abaAtual].esconder) abas[abaAtual].esconder();
    abaAtual = null;
    telaApp.hidden = true;
    telaLogin.hidden = false;
    campoToken.value = '';
    campoToken.focus();
  }

  function mostrarApp(info) {
    telaLogin.hidden = true;
    telaApp.hidden = false;
    document.getElementById('selo-admin').hidden = !info.admin;
    document.getElementById('aviso-exposto').hidden = !info.exposed;
    abrirAba(abaAtual || 'terminais');
  }

  async function iniciar() {
    const { status, dados } = await api('/api/me');
    if (status === 200) mostrarApp(dados);
    else mostrarLogin();
  }

  formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    msgLogin.textContent = '';
    const { status, dados } = await api('/api/login', { method: 'POST', body: { token: campoToken.value } });
    if (status === 200) return iniciar();
    if (status === 429) {
      const minutos = Math.max(1, Math.ceil((dados.retryAfterSeconds || 0) / 60));
      msgLogin.textContent = `Muitas tentativas inválidas. Tente novamente em cerca de ${minutos} min.`;
    } else {
      msgLogin.textContent = dados.error || 'Não foi possível entrar.';
    }
    campoToken.value = '';
    return undefined;
  });

  document.getElementById('botao-sair').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    mostrarLogin();
  });

  document.getElementById('abas').addEventListener('click', (evento) => {
    const botao = evento.target.closest('.aba');
    if (botao) abrirAba(botao.dataset.aba);
  });

  window.Painel = { api, aviso, registrarAba, abrirAba, iniciar };
})();
