'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerminalManager, SCROLLBACK_CHARS, defaultShells } = require('../../src/terminals');
const { HttpError } = require('../../src/validate');
const { createFakeSpawn } = require('../helpers/fake-pty');

function makeManager(overrides = {}) {
  const fake = createFakeSpawn();
  const manager = createTerminalManager({
    spawnPty: fake.spawn,
    exists: () => true,
    isDirectory: (dir) => dir === 'C:\\existe',
    homeDir: 'C:\\inicio',
    now: () => 1700000000000,
    ...overrides,
  });
  return { manager, fake };
}

function collector() {
  const messages = [];
  return { messages, client: { send: (m) => messages.push(m) } };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;

test('RF-03: cria a sessão com o shell, a pasta e o nome informados', () => {
  const { manager, fake } = makeManager();
  const created = manager.create({ shell: 'powershell', cwd: 'C:\\existe', name: 'manutenção' });
  assert.equal(created.name, 'manutenção');
  assert.equal(created.cwd, 'C:\\existe');
  assert.equal(created.shell, 'powershell');
  assert.equal(created.pid, fake.spawned[0].pid);
  assert.equal(created.cwdFallback, false);
  assert.equal(fake.spawned[0].options.cwd, 'C:\\existe');
  assert.deepEqual(fake.spawned[0].args, ['-NoLogo']);
  assert.equal('buffer' in created, false);
  assert.equal('pty' in created, false);
});

test('RF-03: pasta inexistente usa a pasta padrão e sinaliza o fallback', () => {
  const { manager } = makeManager();
  const created = manager.create({ shell: 'cmd', cwd: 'C:\\nao-existe' });
  assert.equal(created.cwd, 'C:\\inicio');
  assert.equal(created.cwdFallback, true);
  assert.equal(manager.create({ shell: 'cmd' }).cwdFallback, false);
});

test('RF-03: nome padrão é gerado quando não informado', () => {
  const { manager } = makeManager();
  assert.match(manager.create({ shell: 'cmd' }).name, /^cmd \d+$/);
});

test('RF-03: shell desconhecido ou sem executável instalado é recusado', () => {
  const { manager } = makeManager({ exists: (file) => !file.endsWith('bash.exe') });
  assert.throws(() => manager.create({ shell: 'zsh' }), status(400));
  assert.throws(() => manager.create({ shell: 'gitbash' }), status(400));
  assert.deepEqual(manager.availableShells().map((s) => s.id), ['powershell', 'cmd', 'wsl']);
});

test('RF-03: tamanho inicial é limitado ao intervalo permitido', () => {
  const { manager, fake } = makeManager();
  manager.create({ shell: 'cmd', cols: 9999, rows: 0 });
  assert.equal(fake.spawned[0].options.cols, 500);
  assert.equal(fake.spawned[0].options.rows, 1);
  manager.create({ shell: 'cmd' });
  assert.equal(fake.spawned[1].options.cols, 120);
  assert.equal(fake.spawned[1].options.rows, 30);
});

test('RN-07: a sessão herda e exibe o privilégio do painel', () => {
  assert.equal(makeManager({ isAdmin: true }).manager.create({ shell: 'cmd' }).admin, true);
  assert.equal(makeManager({ isAdmin: false }).manager.create({ shell: 'cmd' }).admin, false);
});

test('RN-15: o limite de sessões simultâneas é respeitado e liberado ao encerrar', () => {
  const { manager } = makeManager({ maxTerminals: 2 });
  const a = manager.create({ shell: 'cmd' });
  manager.create({ shell: 'cmd' });
  assert.throws(() => manager.create({ shell: 'cmd' }), status(409));
  manager.remove(a.id);
  assert.doesNotThrow(() => manager.create({ shell: 'cmd' }));
});

test('RN-15: o histórico fica limitado a cerca de 200 KB e mantém o mais recente', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  fake.spawned[0].emit('A'.repeat(SCROLLBACK_CHARS));
  fake.spawned[0].emit('FIM-DO-HISTORICO');
  const { messages, client } = collector();
  manager.attach(id, client);
  const replay = messages.find((m) => m.t === 'b').d;
  assert.equal(replay.length, SCROLLBACK_CHARS);
  assert.ok(replay.endsWith('FIM-DO-HISTORICO'));
});

test('RF-05: reanexar entrega o histórico e a saída ao vivo; sair não encerra a sessão', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  fake.spawned[0].emit('primeira linha\r\n');

  const first = collector();
  const detach = manager.attach(id, first.client);
  assert.deepEqual(first.messages, [{ t: 'b', d: 'primeira linha\r\n' }]);
  fake.spawned[0].emit('ao vivo');
  assert.deepEqual(first.messages[1], { t: 'o', d: 'ao vivo' });

  detach();
  assert.equal(fake.spawned[0].killed, false);
  fake.spawned[0].emit(' durante a ausência');

  const second = collector();
  manager.attach(id, second.client);
  assert.equal(second.messages[0].d, 'primeira linha\r\nao vivo durante a ausência');
  assert.equal(first.messages.length, 2);
});

test('RF-05: vários clientes recebem a mesma saída', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  const a = collector();
  const b = collector();
  manager.attach(id, a.client);
  manager.attach(id, b.client);
  fake.spawned[0].emit('x');
  assert.deepEqual(a.messages, [{ t: 'o', d: 'x' }]);
  assert.deepEqual(b.messages, [{ t: 'o', d: 'x' }]);
});

test('RF-05: cliente que falha ao receber é descartado sem afetar os demais', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  const good = collector();
  manager.attach(id, {
    send: () => {
      throw new Error('socket fechado');
    },
  });
  manager.attach(id, good.client);
  fake.spawned[0].emit('a');
  fake.spawned[0].emit('b');
  assert.equal(good.messages.length, 2);
});

test('RF-04: a listagem mostra estado e privilégio de cada sessão', () => {
  const { manager } = makeManager({ isAdmin: true });
  const created = manager.create({ shell: 'powershell', name: 'um' });
  const [item] = manager.list();
  assert.equal(item.id, created.id);
  assert.equal(item.exited, false);
  assert.equal(item.admin, true);
  assert.equal(item.created, 1700000000000);
});

test('RF-06: renomear altera o nome da sessão', () => {
  const { manager } = makeManager();
  const { id } = manager.create({ shell: 'cmd', name: 'antes' });
  assert.equal(manager.rename(id, 'depois').name, 'depois');
  assert.equal(manager.list()[0].name, 'depois');
});

test('RF-06: encerrar mata o shell e remove a sessão', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  const { messages, client } = collector();
  manager.attach(id, client);
  manager.remove(id);
  assert.equal(fake.spawned[0].killed, true);
  assert.equal(manager.list().length, 0);
  assert.ok(messages.some((m) => m.t === 'x'));
  assert.throws(() => manager.remove(id), status(404));
});

test('RF-06: sessão inexistente responde 404', () => {
  const { manager } = makeManager();
  assert.throws(() => manager.rename('abcdefabcdef', 'x'), status(404));
  assert.throws(() => manager.attach('abcdefabcdef', collector().client), status(404));
  assert.throws(() => manager.write('abcdefabcdef', 'x'), status(404));
});

test('RF-04: sessão finalizada continua listada com o código de saída e não aceita entrada', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  fake.spawned[0].exit(3);
  const [item] = manager.list();
  assert.equal(item.exited, true);
  assert.equal(item.exitCode, 3);
  const { messages, client } = collector();
  manager.attach(id, client);
  assert.deepEqual(messages.at(-1), { t: 'x', c: 3 });
  manager.write(id, 'ignorado');
  manager.resize(id, 80, 24);
  assert.equal(fake.spawned[0].written.length, 0);
  manager.remove(id);
  assert.equal(fake.spawned[0].killed, false);
});

test('RF-03: entrada e redimensionamento chegam ao shell, com tamanho limitado', () => {
  const { manager, fake } = makeManager();
  const { id } = manager.create({ shell: 'cmd' });
  manager.write(id, 'dir\r');
  manager.resize(id, 9999, 0);
  manager.resize(id, 'x', undefined);
  assert.deepEqual(fake.spawned[0].written, ['dir\r']);
  assert.deepEqual(fake.spawned[0].resized, [[500, 1], [120, 30]]);
});

test('RN-04: protectedPids lista só os processos vivos das sessões', () => {
  const { manager, fake } = makeManager();
  manager.create({ shell: 'cmd' });
  manager.create({ shell: 'cmd' });
  fake.spawned[1].exit(0);
  assert.deepEqual([...manager.protectedPids()], [fake.spawned[0].pid]);
});

test('RF-06: shutdown encerra todas as sessões', () => {
  const { manager, fake } = makeManager();
  manager.create({ shell: 'cmd' });
  manager.create({ shell: 'cmd' });
  manager.shutdown();
  assert.equal(manager.list().length, 0);
  assert.ok(fake.spawned.every((p) => p.killed));
});

test('RF-03: os shells padrão apontam para executáveis do Windows', () => {
  const shells = defaultShells();
  assert.ok(shells.powershell.file.toLowerCase().endsWith('powershell.exe'));
  assert.ok(shells.cmd.file.toLowerCase().endsWith('cmd.exe'));
  assert.ok(shells.wsl.file.toLowerCase().endsWith('wsl.exe'));
  assert.ok(shells.gitbash.file.toLowerCase().endsWith('bash.exe'));
});

test('RF-22: abre um terminal do WSL em uma distribuição específica com wsl.exe -d', () => {
  const { manager, fake } = makeManager();
  const created = manager.create({ shell: 'wsl', distro: 'Ubuntu-22.04' });
  assert.deepEqual(fake.spawned[0].args, ['-d', 'Ubuntu-22.04']);
  assert.equal(created.distro, 'Ubuntu-22.04');
  assert.equal(created.name, 'WSL Ubuntu-22.04');
  assert.equal(manager.list()[0].distro, 'Ubuntu-22.04');
});

test('RF-22: sem distribuição o WSL abre como antes e os outros shells têm distro nula', () => {
  const { manager, fake } = makeManager();
  assert.equal(manager.create({ shell: 'wsl' }).distro, null);
  assert.deepEqual(fake.spawned[0].args, []);
  assert.equal(manager.create({ shell: 'cmd', distro: '' }).distro, null);
});

test('RN-17: a distribuição só vale para o WSL e precisa ser um nome seguro', () => {
  const { manager, fake } = makeManager();
  assert.throws(() => manager.create({ shell: 'cmd', distro: 'Ubuntu' }), status(400));
  assert.throws(() => manager.create({ shell: 'powershell', distro: 'Ubuntu' }), status(400));
  for (const distro of ['-d', '--exec', 'a b', 'a;calc', '../x', 'a'.repeat(65), '-u root']) {
    assert.throws(() => manager.create({ shell: 'wsl', distro }), status(400), distro);
  }
  assert.equal(fake.spawned.length, 0, 'nada foi iniciado');
});

test('RN-18: o padrão é o privilégio do painel e pedir administrador executa o shell direto', () => {
  const lowered = [];
  const { manager, fake } = makeManager({ isAdmin: true, launchLowPrivilege: (o) => { lowered.push(o); return null; } });
  assert.equal(manager.create({ shell: 'cmd' }).admin, true);
  assert.equal(manager.create({ shell: 'cmd', admin: true }).admin, true);
  assert.equal(lowered.length, 0);
  assert.equal(fake.spawned[0].file.toLowerCase().endsWith('cmd.exe'), true);
});

test('RN-18: com painel elevado, admin falso abre o shell pelo lançador sem privilégio e exibe sem admin', () => {
  const calls = [];
  const { manager, fake } = makeManager({
    isAdmin: true,
    launchLowPrivilege: (o) => {
      calls.push(o);
      return { file: 'lancador.exe', args: ['-x'], env: { PP_PARAMS: 'p' } };
    },
  });
  const created = manager.create({ shell: 'wsl', distro: 'Ubuntu', cwd: 'C:\\existe', admin: false });
  assert.equal(created.admin, false);
  assert.equal(manager.list()[0].admin, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file.toLowerCase().endsWith('wsl.exe'), true);
  assert.deepEqual(calls[0].args, ['-d', 'Ubuntu']);
  assert.equal(calls[0].cwd, 'C:\\existe');
  assert.equal(fake.spawned[0].file, 'lancador.exe');
  assert.deepEqual(fake.spawned[0].args, ['-x']);
  assert.deepEqual(fake.spawned[0].options.env, { PP_PARAMS: 'p' });
});

test('RN-18: com painel sem elevação o terminal abre sem lançador e pedir administrador é recusado', () => {
  const { manager, fake } = makeManager({ isAdmin: false, launchLowPrivilege: () => assert.fail('não deveria usar o lançador') });
  assert.equal(manager.create({ shell: 'cmd' }).admin, false);
  assert.equal(manager.create({ shell: 'cmd', admin: false }).admin, false);
  assert.throws(() => manager.create({ shell: 'cmd', admin: true }), status(400));
  assert.equal(fake.spawned.length, 2);
});

test('RN-17: admin precisa ser booleano', () => {
  const { manager, fake } = makeManager({ isAdmin: true });
  for (const bad of ['false', 0, 1, null, {}]) assert.throws(() => manager.create({ shell: 'cmd', admin: bad }), status(400));
  assert.equal(fake.spawned.length, 0);
});
