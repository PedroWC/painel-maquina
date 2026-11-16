'use strict';

// Teste de sistema (windows): ciclo de vida de uma tarefa real, sempre com o
// prefixo PainelTeste_ e limpeza no final. Não toca em nenhuma outra tarefa.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPowerShell } = require('../../src/powershell');
const { TASK_LIST, TASK_ACTION, TASK_SAVE } = require('../../src/ps-scripts');

const NAME = 'PainelTeste_tarefa1';
const PATH = '\\';
const ps = createPowerShell();

async function list(all = false) {
  return (await ps.runJson(TASK_LIST, { all })) || [];
}

async function removeIfExists() {
  if ((await list()).some((t) => t.name === NAME)) {
    await ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'delete' });
  }
}

test(
  'RF-07 a RF-10: cria, lista, desativa, ativa, edita e exclui uma tarefa real',
  { skip: process.platform !== 'win32', timeout: 120000 },
  async () => {
    await removeIfExists();
    try {
      await ps.run(TASK_SAVE, {
        mode: 'create',
        name: NAME,
        path: PATH,
        command: 'cmd.exe',
        args: '/c exit 0',
        workdir: '',
        trigger: { type: 'daily', time: '04:30' },
        runAs: 'user',
        highest: false,
        replace: false,
      });

      let task = (await list()).find((t) => t.name === NAME);
      assert.ok(task, 'a tarefa criada deveria aparecer na lista');
      assert.equal(task.command, 'cmd.exe');
      assert.equal(task.args, '/c exit 0');
      assert.match(task.triggers, /Diário 04:30/);
      assert.equal(task.enabled, true);

      await assert.rejects(
        ps.run(TASK_SAVE, { mode: 'create', name: NAME, path: PATH, command: 'cmd.exe', trigger: { type: 'none' }, runAs: 'user' }),
        /TAREFA_EXISTE/,
      );

      await ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'disable' });
      task = (await list()).find((t) => t.name === NAME);
      assert.equal(task.enabled, false);
      await assert.rejects(ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'run' }), /TAREFA_DESATIVADA/);
      await ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'enable' });
      assert.equal((await list()).find((t) => t.name === NAME).enabled, true);
      await ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'run' });

      await ps.run(TASK_SAVE, {
        mode: 'edit',
        name: NAME,
        path: PATH,
        command: 'cmd.exe',
        args: '/c exit 1',
        workdir: '',
        trigger: { type: 'weekly', time: '05:15', days: ['Monday', 'Friday'] },
      });
      task = (await list()).find((t) => t.name === NAME);
      assert.equal(task.args, '/c exit 1');
      assert.match(task.triggers, /Semanal 05:15/);

      await ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'delete' });
      assert.equal((await list()).some((t) => t.name === NAME), false);
      await assert.rejects(ps.run(TASK_ACTION, { name: NAME, path: PATH, op: 'run' }), /TAREFA_NAO_EXISTE/);
    } finally {
      await removeIfExists();
    }
  },
);

test('RN-08: a listagem padrão oculta as tarefas do Windows e all=true as inclui', { skip: process.platform !== 'win32', timeout: 120000 }, async () => {
  const visible = await list(false);
  assert.equal(visible.some((t) => t.path.startsWith('\\Microsoft\\')), false);
  const everything = await list(true);
  assert.ok(everything.length >= visible.length);
});
