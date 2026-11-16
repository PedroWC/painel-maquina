'use strict';

// Rotas de serviços do Windows (RF-11 a RF-14, RF-25, RN-05, RN-09).

const { HttpError, badRequest, str, optionalStr, oneOf } = require('../validate');
const { assertServiceAllowed, isCriticalService, requiresTypedConfirm } = require('../protections');
const {
  SERVICE_LIST,
  SERVICE_ACTION,
  SERVICE_CREATE,
  SERVICE_EDIT,
} = require('../ps-scripts');

// Sem curingas (* ? [ ]) nem separadores: o nome identifica exatamente um serviço.
const NAME = /^[^\\/<>:"|?*[\]]+$/;
const OPS = ['start', 'stop', 'restart', 'auto', 'manual', 'disabled', 'delete'];
const START = { auto: 'Automatic', manual: 'Manual', disabled: 'Disabled' };

function mapError(err) {
  const message = String((err && err.message) || '');
  if (message.includes('SERVICO_NAO_EXISTE')) return new HttpError(404, 'Serviço não encontrado.');
  if (message.includes('SERVICO_EXISTE')) return new HttpError(409, 'Já existe um serviço com esse nome.');
  return err;
}

function serviceName(body) {
  return str(body.name, { field: 'nome', max: 256, pattern: NAME });
}

function requireTypedConfirm(body, name, op) {
  if (requiresTypedConfirm(name, op) && body.confirm !== name) {
    throw badRequest('Confirmação inválida: digite o nome do serviço para continuar.');
  }
}

function createServiceRoutes({ ps }) {
  async function run(script, params, audit, ip, action, target) {
    try {
      await ps.run(script, params);
    } catch (err) {
      audit.record({ ip, action, target, result: 'falha' });
      throw mapError(err);
    }
    audit.record({ ip, action, target, result: 'ok' });
    return { ok: true };
  }

  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/services$/,
      handler: async () => {
        const list = await ps.runJson(SERVICE_LIST, {});
        const services = (Array.isArray(list) ? list : []).map((s) => ({
          ...s,
          critical: isCriticalService(s.name), // RN-09: a interface desabilita as ações
        }));
        return { services };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/services\/action$/,
      handler: ({ body, audit, ip }) => {
        const name = serviceName(body);
        const op = oneOf(body.op, OPS, 'operação');
        assertServiceAllowed(name, op);
        requireTypedConfirm(body, name, op);
        return run(SERVICE_ACTION, { name, op }, audit, ip, `servico.${op}`, name);
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/services$/,
      handler: ({ body, audit, ip }) => {
        const name = serviceName(body);
        assertServiceAllowed(name, 'edit');
        const params = {
          name,
          path: str(body.path, { field: 'executável', max: 1024 }),
          display: optionalStr(body.display, { field: 'nome de exibição', max: 256 }),
          desc: optionalStr(body.desc, { field: 'descrição', max: 1024 }),
          start: START[oneOf(body.start === undefined ? 'auto' : body.start, Object.keys(START), 'inicialização')],
        };
        return run(SERVICE_CREATE, params, audit, ip, 'servico.criar', name);
      },
    },
    {
      method: 'PUT',
      pattern: /^\/api\/services$/,
      handler: ({ body, audit, ip }) => {
        const name = serviceName(body);
        assertServiceAllowed(name, 'edit');
        requireTypedConfirm(body, name, 'edit');
        const params = {
          name,
          path: optionalStr(body.path, { field: 'executável', max: 1024 }),
          display: optionalStr(body.display, { field: 'nome de exibição', max: 256 }),
          desc: body.desc === undefined ? null : optionalStr(body.desc, { field: 'descrição', max: 1024 }),
          start: body.start === undefined ? '' : START[oneOf(body.start, Object.keys(START), 'inicialização')],
        };
        return run(SERVICE_EDIT, params, audit, ip, 'servico.editar', name);
      },
    },
  ];

  return { routes };
}

module.exports = { createServiceRoutes };
