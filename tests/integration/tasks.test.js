'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request, post, login } = require('../helpers/server');
const { createFakePs } = require('../helpers/fake-ps');
const { createTaskRoutes } = require('../../src/routes/tasks');
const { TASK_LIST, TASK_ACTION, TASK_SAVE } = require('../../src/ps-scripts');
const { HttpError } = require('../../src/validate');

async function setup(psOptions) {
  const ps = createFakePs(psOptions);
  const { routes } = createTaskRoutes({ ps });
  const srv = await startTestServer({ routes });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  const send = (method, path, body) =>
    request({
      port: srv.port,
      method,
      path,
      body,
      headers: { ...auth, 'Content-Type': 'application/json', 'X-Requested-With': 'painel' },
    });
  return { srv, ps, auth, send };
}

const validCreate = {
  name: 'MinhaTarefa',
  command: 'C:\\scripts\\rotina.cmd',
  trigger: { type: 'daily', time: '03:00' },
};

test('RF-07: lista as tarefas devolvidas pelo sistema', async () => {
  const items = [{ name: 'MinhaTarefa', state: 'Ready' }];
  const { srv, ps, auth } = await setup({ listResult: items });
  try {
    const res = await request({ port: srv.port, path: '/api/tasks', headers: auth });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.tasks, [{ ...items[0], protected: false }]);
    assert.equal(ps.calls[0].script, TASK_LIST);
  } finally {
    await srv.close();
  }
});

test('RN-03: a tarefa do painel vem marcada como protegida na listagem', async () => {
  const { srv, auth } = await setup({ listResult: [{ name: 'PainelMaquina' }, { name: 'Outra' }] });
  try {
    const res = await request({ port: srv.port, path: '/api/tasks', headers: auth });
    assert.deepEqual(res.json.tasks.map((t) => t.protected), [true, false]);
  } finally {
    await srv.close();
  }
});

test('RN-17: nomes com curingas (* ? [ ]) são recusados para não atingir várias tarefas', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const name of ['*', '?', 'a*', '[abc]', 'Tarefa[1]']) {
      assert.equal((await send('POST', '/api/tasks/action', { name, op: 'run' })).status, 400, name);
      const path = '\\' + name + '\\';
      assert.equal((await send('POST', '/api/tasks/action', { name: 'ok', path, op: 'run' })).status, 400, `caminho ${name}`);
    }
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RF-07: resposta vazia ou inesperada vira lista vazia', async () => {
  const { srv, auth } = await setup({ listResult: null });
  try {
    const res = await request({ port: srv.port, path: '/api/tasks', headers: auth });
    assert.deepEqual(res.json.tasks, []);
  } finally {
    await srv.close();
  }
});

test('RN-08: tarefas do Windows ficam ocultas por padrão e aparecem com all=1', async () => {
  const { srv, ps, auth } = await setup();
  try {
    await request({ port: srv.port, path: '/api/tasks', headers: auth });
    await request({ port: srv.port, path: '/api/tasks?all=1', headers: auth });
    assert.deepEqual(ps.calls.map((c) => c.params.all), [false, true]);
  } finally {
    await srv.close();
  }
});

test('RF-08 e RF-09: executar, parar, ativar e desativar chegam ao sistema com os parâmetros certos', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const op of ['run', 'stop', 'enable', 'disable']) {
      const res = await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op });
      assert.equal(res.status, 200, op);
    }
    assert.deepEqual(
      ps.calls.map((c) => [c.script === TASK_ACTION, c.params.name, c.params.path, c.params.op]),
      ['run', 'stop', 'enable', 'disable'].map((op) => [true, 'MinhaTarefa', '\\', op]),
    );
  } finally {
    await srv.close();
  }
});

test('RN-17: operação, nome e caminho inválidos respondem 400 sem tocar o sistema', async () => {
  const { srv, ps, send } = await setup();
  try {
    const bad = [
      { name: 'MinhaTarefa', op: 'format' },
      { name: 'MinhaTarefa' },
      { name: '', op: 'run' },
      { name: 'a/b', op: 'run' },
      { name: 'a\\b', op: 'run' },
      { name: 'x'.repeat(201), op: 'run' },
      { name: 'MinhaTarefa', path: 'sem-barra', op: 'run' },
      { name: 'MinhaTarefa', path: '\\a\\..\\*\\', op: 'run' },
      { name: 5, op: 'run' },
    ];
    for (const body of bad) {
      assert.equal((await send('POST', '/api/tasks/action', body)).status, 400, JSON.stringify(body));
    }
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RN-17: nada digitado pelo cliente vira parte do script', async () => {
  const { srv, ps, send } = await setup();
  try {
    const hostile = "x'; Remove-Item C:\\ -Recurse #";
    await send('POST', '/api/tasks', { ...validCreate, name: 'Tarefa', args: hostile, workdir: hostile });
    const call = ps.calls[0];
    assert.equal(call.script, TASK_SAVE);
    assert.equal(call.script.includes('Remove-Item'), false);
    assert.equal(call.params.args, hostile);
  } finally {
    await srv.close();
  }
});

test('RN-03: a tarefa do painel não pode ser parada, desativada, editada nem excluída', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const op of ['stop', 'disable']) {
      assert.equal((await send('POST', '/api/tasks/action', { name: 'PainelMaquina', op })).status, 409, op);
    }
    const del = await send('POST', '/api/tasks/action', { name: 'PainelMaquina', op: 'delete', confirm: 'PainelMaquina' });
    assert.equal(del.status, 409);
    assert.equal((await send('PUT', '/api/tasks', { ...validCreate, name: 'PainelMaquina' })).status, 409);
    assert.equal((await send('POST', '/api/tasks', { ...validCreate, name: 'painelmaquina' })).status, 409);
    assert.equal(ps.calls.length, 0);
    assert.ok(srv.readAudit().split(/\r?\n/).filter((l) => l.includes('"recusado"')).length >= 5, 'as recusas devem ser auditadas');
    assert.equal((await send('POST', '/api/tasks/action', { name: 'PainelMaquina', op: 'run' })).status, 200);
  } finally {
    await srv.close();
  }
});

test('RN-05: excluir exige digitar o nome da tarefa, também no servidor', async () => {
  const { srv, ps, send } = await setup();
  try {
    assert.equal((await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'delete' })).status, 400);
    assert.equal(
      (await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'delete', confirm: 'outra' })).status,
      400,
    );
    assert.equal(ps.calls.length, 0);
    const ok = await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'delete', confirm: 'MinhaTarefa' });
    assert.equal(ok.status, 200);
    assert.equal(ps.calls[0].params.op, 'delete');
  } finally {
    await srv.close();
  }
});

test('RF-10: cria a tarefa com os parâmetros validados e valores padrão', async () => {
  const { srv, ps, send } = await setup();
  try {
    const res = await send('POST', '/api/tasks', {
      ...validCreate,
      args: '--rapido',
      workdir: 'C:\\scripts',
      runAs: 'user',
      highest: true,
    });
    assert.equal(res.status, 200);
    const { script, params } = ps.calls[0];
    assert.equal(script, TASK_SAVE);
    assert.deepEqual(params, {
      name: 'MinhaTarefa',
      path: '\\',
      command: 'C:\\scripts\\rotina.cmd',
      args: '--rapido',
      workdir: 'C:\\scripts',
      trigger: { type: 'daily', time: '03:00' },
      runAs: 'user',
      highest: true,
      replace: false,
      mode: 'create',
    });
    await send('POST', '/api/tasks', validCreate);
    assert.equal(ps.calls[1].params.runAs, 'SYSTEM');
    assert.equal(ps.calls[1].params.highest, false);
  } finally {
    await srv.close();
  }
});

test('RF-10: aceita todos os tipos de gatilho e valida horários e dias', async () => {
  const { srv, ps, send } = await setup();
  try {
    for (const trigger of [
      { type: 'none' },
      { type: 'logon' },
      { type: 'startup' },
      { type: 'once', time: '23:59' },
      { type: 'weekly', time: '08:30', days: ['Monday', 'Friday', 'Monday'] },
    ]) {
      assert.equal((await send('POST', '/api/tasks', { ...validCreate, trigger })).status, 200, JSON.stringify(trigger));
    }
    assert.deepEqual(ps.calls.at(-1).params.trigger, { type: 'weekly', time: '08:30', days: ['Monday', 'Friday'] });

    const invalid = [
      undefined,
      null,
      'diario',
      { type: 'hourly' },
      { type: 'daily', time: '24:00' },
      { type: 'daily', time: '3:00' },
      { type: 'daily', time: '03:60' },
      { type: 'weekly', time: '03:00' },
      { type: 'weekly', time: '03:00', days: [] },
      { type: 'weekly', time: '03:00', days: ['Someday'] },
    ];
    const before = ps.calls.length;
    for (const trigger of invalid) {
      assert.equal((await send('POST', '/api/tasks', { ...validCreate, trigger })).status, 400, JSON.stringify(trigger));
    }
    assert.equal(ps.calls.length, before);
  } finally {
    await srv.close();
  }
});

test('RF-10: comando obrigatório e demais campos validados na criação', async () => {
  const { srv, ps, send } = await setup();
  try {
    const bad = [
      { ...validCreate, command: '' },
      { ...validCreate, command: undefined },
      { ...validCreate, command: 'a\nb' },
      { ...validCreate, args: 'x'.repeat(1025) },
      { ...validCreate, workdir: 'x'.repeat(261) },
      { ...validCreate, runAs: 'root' },
      { ...validCreate, name: undefined },
    ];
    for (const body of bad) assert.equal((await send('POST', '/api/tasks', body)).status, 400, JSON.stringify(body));
    assert.equal(ps.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('RF-10: criar uma tarefa que já existe responde 409 até confirmar a substituição', async () => {
  const failWith = () => new HttpError(500, 'TAREFA_EXISTE');
  const { srv, send } = await setup({ failWith });
  try {
    const res = await send('POST', '/api/tasks', validCreate);
    assert.equal(res.status, 409);
    assert.match(res.json.error, /Já existe/);
  } finally {
    await srv.close();
  }
  const ok = await setup();
  try {
    await ok.send('POST', '/api/tasks', { ...validCreate, replace: true });
    assert.equal(ok.ps.calls[0].params.replace, true);
  } finally {
    await ok.srv.close();
  }
});

test('RF-10: editar mantém os gatilhos quando não informados e 404 se a tarefa não existe', async () => {
  const { srv, ps, send } = await setup();
  try {
    const res = await send('PUT', '/api/tasks', { name: 'MinhaTarefa', command: 'cmd.exe', args: '/c exit' });
    assert.equal(res.status, 200);
    assert.equal(ps.calls[0].params.mode, 'edit');
    assert.deepEqual(ps.calls[0].params.trigger, { type: 'none' });
  } finally {
    await srv.close();
  }
  const missing = await setup({ failWith: () => new HttpError(500, 'TAREFA_NAO_EXISTE') });
  try {
    assert.equal((await missing.send('PUT', '/api/tasks', { name: 'Nada', command: 'cmd.exe' })).status, 404);
    const act = await missing.send('POST', '/api/tasks/action', { name: 'Nada', op: 'run' });
    assert.equal(act.status, 404);
  } finally {
    await missing.srv.close();
  }
});

test('RF-08: executar uma tarefa desativada responde 409 com explicação', async () => {
  const { srv, send } = await setup({ failWith: () => new HttpError(500, 'TAREFA_DESATIVADA') });
  try {
    const res = await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'run' });
    assert.equal(res.status, 409);
    assert.match(res.json.error, /ative-a antes/);
  } finally {
    await srv.close();
  }
});

test('RNF-01: todas as rotas de tarefas exigem sessão e X-Requested-With', async () => {
  const { srv, auth } = await setup();
  try {
    const calls = [
      { method: 'GET', path: '/api/tasks' },
      { method: 'POST', path: '/api/tasks', body: validCreate },
      { method: 'PUT', path: '/api/tasks', body: validCreate },
      { method: 'POST', path: '/api/tasks/action', body: { name: 'a', op: 'run' } },
    ];
    for (const call of calls) {
      const anon = await request({
        port: srv.port,
        ...call,
        headers: { 'X-Requested-With': 'painel', 'Content-Type': 'application/json' },
      });
      assert.equal(anon.status, 401, `${call.method} ${call.path}`);
      if (call.method !== 'GET') {
        const noHeader = await request({ port: srv.port, ...call, headers: { ...auth, 'Content-Type': 'application/json' } });
        assert.equal(noHeader.status, 403, `${call.method} ${call.path} sem cabeçalho`);
      }
    }
  } finally {
    await srv.close();
  }
});

test('RN-06: ações sobre tarefas são auditadas, inclusive falhas', async () => {
  const { srv, send } = await setup();
  try {
    await send('POST', '/api/tasks', validCreate);
    await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'disable' });
    await send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'delete', confirm: 'MinhaTarefa' });
    const events = srv.readAudit().trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.action.startsWith('tarefa.'));
    assert.deepEqual(events.map((e) => [e.action, e.target, e.result]), [
      ['tarefa.criar', 'MinhaTarefa', 'ok'],
      ['tarefa.disable', 'MinhaTarefa', 'ok'],
      ['tarefa.delete', 'MinhaTarefa', 'ok'],
    ]);
  } finally {
    await srv.close();
  }
  const failing = await setup({ failWith: () => new HttpError(500, 'erro qualquer') });
  try {
    await failing.send('POST', '/api/tasks/action', { name: 'MinhaTarefa', op: 'run' });
    assert.match(failing.srv.readAudit(), /"tarefa\.run".*"falha"/);
  } finally {
    await failing.srv.close();
  }
});

test('RN-06: erro interno do sistema é repassado como mensagem limpa (500)', async () => {
  const { srv, send } = await setup({ failWith: () => new HttpError(500, 'Acesso negado.') });
  try {
    const res = await send('POST', '/api/tasks', validCreate);
    assert.equal(res.status, 500);
    assert.equal(res.json.error, 'Acesso negado.');
  } finally {
    await srv.close();
  }
});

test('RF-10: login de teste continua válido (sanidade do helper)', async () => {
  const srv = await startTestServer();
  try {
    assert.equal((await login(srv.port)).res.status, 200);
    assert.equal((await post(srv.port, '/api/login', { token: 'x' })).status, 401);
  } finally {
    await srv.close();
  }
});
