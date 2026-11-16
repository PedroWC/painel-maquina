'use strict';

// Rotas de tarefas agendadas (RF-07 a RF-10, RF-25, RN-03, RN-05, RN-08).

const { HttpError, badRequest, str, optionalStr, oneOf } = require('../validate');
const { assertTaskAllowed } = require('../protections');
const { TASK_LIST, TASK_ACTION, TASK_SAVE } = require('../ps-scripts');

const NAME = /^[^\\/<>:"|?*]+$/;
const PATH = /^\\([^\\/<>:"|?*]+\\)*$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const OPS = ['run', 'stop', 'enable', 'disable', 'delete'];
const TRIGGERS = ['none', 'daily', 'weekly', 'logon', 'startup', 'once'];

function mapError(err) {
  const message = String((err && err.message) || '');
  if (message.includes('TAREFA_NAO_EXISTE')) return new HttpError(404, 'Tarefa não encontrada.');
  if (message.includes('TAREFA_DESATIVADA')) {
    return new HttpError(409, 'Tarefa desativada: ative-a antes de executar.');
  }
  if (message.includes('TAREFA_EXISTE')) {
    return new HttpError(409, 'Já existe uma tarefa com esse nome. Confirme a substituição para continuar.');
  }
  return err;
}

function taskRef(body) {
  return {
    name: str(body.name, { field: 'nome', max: 200, pattern: NAME }),
    path: body.path === undefined ? '\\' : str(body.path, { field: 'caminho', max: 200, pattern: PATH }),
  };
}

function parseTrigger(trigger, { allowKeep }) {
  if (trigger === undefined && allowKeep) return { type: 'none' };
  if (trigger === null || typeof trigger !== 'object') throw badRequest('gatilho inválido.');
  const type = oneOf(trigger.type, TRIGGERS, 'gatilho');
  const out = { type };
  if (['daily', 'weekly', 'once'].includes(type)) {
    out.time = str(trigger.time === undefined ? '03:00' : trigger.time, { field: 'horário', max: 5, pattern: TIME });
  }
  if (type === 'weekly') {
    if (!Array.isArray(trigger.days) || trigger.days.length === 0 || trigger.days.length > 7) {
      throw badRequest('Informe ao menos um dia da semana.');
    }
    out.days = [...new Set(trigger.days.map((day) => oneOf(day, DAYS, 'dia da semana')))];
  }
  return out;
}

function actionFields(body) {
  return {
    command: str(body.command, { field: 'comando', max: 260 }),
    args: optionalStr(body.args, { field: 'argumentos', max: 1024 }),
    workdir: optionalStr(body.workdir, { field: 'pasta de trabalho', max: 260 }),
  };
}

function createTaskRoutes({ ps }) {
  async function save(params, mode) {
    try {
      await ps.run(TASK_SAVE, { ...params, mode });
    } catch (err) {
      throw mapError(err);
    }
  }

  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/tasks$/,
      handler: async ({ url }) => {
        const all = url.searchParams.get('all') === '1';
        const tasks = await ps.runJson(TASK_LIST, { all });
        return { tasks: Array.isArray(tasks) ? tasks : [] };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/tasks\/action$/,
      handler: async ({ body, audit, ip }) => {
        const ref = taskRef(body);
        const op = oneOf(body.op, OPS, 'operação');
        assertTaskAllowed(ref.name, op);
        // RN-05: excluir exige digitar o nome da tarefa (verificado também no servidor).
        if (op === 'delete' && body.confirm !== ref.name) {
          throw badRequest('Confirmação inválida: digite o nome da tarefa para excluí-la.');
        }
        try {
          await ps.run(TASK_ACTION, { ...ref, op });
        } catch (err) {
          audit.record({ ip, action: `tarefa.${op}`, target: ref.name, result: 'falha' });
          throw mapError(err);
        }
        audit.record({ ip, action: `tarefa.${op}`, target: ref.name, result: 'ok' });
        return { ok: true };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/tasks$/,
      handler: async ({ body, audit, ip }) => {
        const ref = taskRef(body);
        assertTaskAllowed(ref.name, 'edit');
        const params = {
          ...ref,
          ...actionFields(body),
          trigger: parseTrigger(body.trigger, { allowKeep: false }),
          runAs: oneOf(body.runAs === undefined ? 'SYSTEM' : body.runAs, ['SYSTEM', 'user'], 'conta'),
          highest: body.highest === true,
          replace: body.replace === true,
        };
        try {
          await save(params, 'create');
        } catch (err) {
          audit.record({ ip, action: 'tarefa.criar', target: ref.name, result: 'falha' });
          throw err;
        }
        audit.record({ ip, action: 'tarefa.criar', target: ref.name, result: 'ok', detail: { runAs: params.runAs } });
        return { ok: true };
      },
    },
    {
      method: 'PUT',
      pattern: /^\/api\/tasks$/,
      handler: async ({ body, audit, ip }) => {
        const ref = taskRef(body);
        assertTaskAllowed(ref.name, 'edit');
        const params = {
          ...ref,
          ...actionFields(body),
          trigger: parseTrigger(body.trigger, { allowKeep: true }),
        };
        try {
          await save(params, 'edit');
        } catch (err) {
          audit.record({ ip, action: 'tarefa.editar', target: ref.name, result: 'falha' });
          throw err;
        }
        audit.record({ ip, action: 'tarefa.editar', target: ref.name, result: 'ok' });
        return { ok: true };
      },
    },
  ];

  return { routes };
}

module.exports = { createTaskRoutes };
