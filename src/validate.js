'use strict';

// Validação de entradas (RN-17). Toda entrada do cliente passa por aqui antes
// de chegar ao sistema. Erros viram HttpError com status HTTP apropriado.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function str(value, { field = 'valor', min = 1, max = 256, pattern } = {}) {
  if (typeof value !== 'string') throw badRequest(`${field} deve ser um texto.`);
  if (CONTROL_CHARS.test(value)) throw badRequest(`${field} contém caracteres inválidos.`);
  if (value.length < min) throw badRequest(`${field} é obrigatório.`);
  if (value.length > max) throw badRequest(`${field} deve ter no máximo ${max} caracteres.`);
  if (pattern && !pattern.test(value)) throw badRequest(`${field} tem formato inválido.`);
  return value;
}

function optionalStr(value, options = {}) {
  if (value === undefined || value === null || value === '') return '';
  return str(value, { ...options, min: 0 });
}

function oneOf(value, allowed, field = 'valor') {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw badRequest(`${field} inválido. Valores aceitos: ${allowed.join(', ')}.`);
  }
  return value;
}

function int(value, { field = 'valor', min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${field} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return value;
}

module.exports = { HttpError, badRequest, str, optionalStr, oneOf, int };
