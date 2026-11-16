'use strict';

// Registro dos provedores: detecta o que está instalado, repete a detecção
// periodicamente (RF-23) e só entrega provedores disponíveis (RN-11).
// Falhas de um provedor nunca afetam os demais (RN-14).

const DETECT_TIMEOUT_MS = 10000;
const MAX_ERROR_CHARS = 200;

function withTimeout(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function createRegistry({ providers, intervalMs = 5 * 60 * 1000, detectTimeoutMs = DETECT_TIMEOUT_MS, now = Date.now }) {
  const status = new Map();
  let timer = null;

  async function detectOne(provider) {
    try {
      const result = await withTimeout(provider.detect(), detectTimeoutMs, 'Tempo esgotado na detecção.');
      status.set(provider.id, {
        disponivel: Boolean(result && result.disponivel),
        versao: (result && result.versao) || '',
        info: (result && result.info) || null,
        erro: null,
        verificadoEm: now(),
      });
    } catch (err) {
      status.set(provider.id, {
        disponivel: false,
        versao: '',
        info: null,
        erro: String((err && err.message) || 'Falha na detecção.').slice(0, MAX_ERROR_CHARS),
        verificadoEm: now(),
      });
    }
  }

  async function refresh() {
    await Promise.all(providers.map(detectOne));
    return list();
  }

  function list() {
    return providers.map((p) => {
      const s = status.get(p.id) || { disponivel: false, versao: '', info: null, erro: null, verificadoEm: null };
      return { id: p.id, nome: p.nome, ...s };
    });
  }

  // RN-11: provedor ausente (ou desconhecido) não existe para o restante do sistema.
  function get(id) {
    const provider = providers.find((p) => p.id === id);
    const s = status.get(id);
    return provider && s && s.disponivel ? provider : null;
  }

  function start() {
    refresh();
    timer = setInterval(refresh, intervalMs);
    timer.unref();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  return { refresh, list, get, start, stop };
}

module.exports = { createRegistry, withTimeout };
