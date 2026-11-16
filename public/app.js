'use strict';

// Interface mínima: login, logout e estado da sessão (RF-01, RF-02).
// Todo texto vem do servidor e é inserido com textContent (nunca innerHTML).

const telaLogin = document.getElementById('tela-login');
const telaApp = document.getElementById('tela-app');
const formLogin = document.getElementById('form-login');
const campoToken = document.getElementById('token');
const msgLogin = document.getElementById('msg-login');

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    method: opcoes.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'painel' },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    credentials: 'same-origin',
  });
  const dados = await resposta.json().catch(() => ({}));
  return { status: resposta.status, dados };
}

function mostrar(logado, info) {
  telaLogin.hidden = logado;
  telaApp.hidden = !logado;
  if (logado) {
    document.getElementById('selo-admin').hidden = !info.admin;
    document.getElementById('aviso-exposto').hidden = !info.exposed;
  } else {
    campoToken.value = '';
    campoToken.focus();
  }
}

async function iniciar() {
  const { status, dados } = await api('/api/me');
  mostrar(status === 200, dados);
}

formLogin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  msgLogin.textContent = '';
  const { status, dados } = await api('/api/login', { method: 'POST', body: { token: campoToken.value } });
  if (status === 200) return iniciar();
  if (status === 429) {
    const minutos = Math.ceil((dados.retryAfterSeconds || 0) / 60);
    msgLogin.textContent = `Muitas tentativas inválidas. Tente novamente em cerca de ${minutos} min.`;
  } else {
    msgLogin.textContent = dados.error || 'Não foi possível entrar.';
  }
  campoToken.value = '';
  return undefined;
});

document.getElementById('botao-sair').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  mostrar(false, {});
});

iniciar();
