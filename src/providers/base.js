'use strict';

// Contrato dos provedores (ADR 0012, docs/arquitetura/provedores.md).
//
// Um provedor integra uma tecnologia opcional (Docker, pm2, Kubernetes...):
//   id, nome            identificação (id: letras minúsculas, números e hífen)
//   detect()            => { disponivel, versao?, info? }  (ferramenta ausente => disponivel: false)
//   list()              => { sections: [...], contexto? }  (ver docs)
//   actions             allowlist de operações { rotulo, destrutiva, confirmarNome?, validar?, run(id, params) }
//   logs(id)            => texto (opcional)
//   validateId(id)      valida o identificador do recurso (padrão: SAFE_ID)
//   timeoutMs           tempo limite de cada chamada (opcional)

const { badRequest } = require('../validate');

const PROVIDER_ID = /^[a-z0-9-]{1,20}$/;
// Primeiro caractere alfanumérico: impede que um id vire opção de linha de comando (-f, --all...).
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:\-/@]{0,255}$/;

function safeId(value, field = 'identificador') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw badRequest(`${field} inválido.`);
  return value;
}

// Duração legível (por exemplo, "1h 2min") para colunas de tempo ativo e idade.
function humanDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function defineProvider(definition) {
  const { id, nome, detect, list, actions } = definition;
  if (typeof id !== 'string' || !PROVIDER_ID.test(id)) throw new Error(`Provedor com id inválido: ${id}`);
  if (typeof nome !== 'string' || nome === '') throw new Error(`Provedor ${id} sem nome.`);
  if (typeof detect !== 'function') throw new Error(`Provedor ${id} sem detect().`);
  if (typeof list !== 'function') throw new Error(`Provedor ${id} sem list().`);
  if (actions === null || typeof actions !== 'object') throw new Error(`Provedor ${id} sem actions.`);
  for (const [op, action] of Object.entries(actions)) {
    if (typeof action.rotulo !== 'string' || typeof action.destrutiva !== 'boolean' || typeof action.run !== 'function') {
      throw new Error(`Ação ${id}.${op} deve ter rotulo, destrutiva (boolean) e run().`);
    }
  }
  return Object.freeze({ validateId: safeId, ...definition });
}

module.exports = { defineProvider, safeId, humanDuration, SAFE_ID, PROVIDER_ID };
