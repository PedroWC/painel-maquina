'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createPm2Provider, createPm2Locator, humanDuration, parseJlist } = require('../../../src/providers/pm2');
const { createFakeCli } = require('../../helpers/fake-cli');
const { HttpError } = require('../../../src/validate');

const ENTRY = 'C:\\npm\\node_modules\\pm2\\bin\\pm2';
const NODE = 'C:\\node\\node.exe';
const NOW = 1_700_000_000_000;

function proc(overrides = {}) {
  const { env: envOverrides, monit: monitOverrides, ...top } = overrides;
  return {
    name: 'api',
    pm_id: 0,
    pid: 5000,
    monit: { memory: 52428800, cpu: 1.5, ...monitOverrides },
    pm2_env: { status: 'online', exec_mode: 'fork_mode', restart_time: 2, pm_uptime: NOW - 3_725_000, ...envOverrides },
    ...top,
  };
}

function setup({ processes = [], daemon = true, protectedPids = [], handler } = {}) {
  const cli = createFakeCli(
    handler ||
      ((exe, args) => {
        if (args[1] === '--version') return { stdout: '5.4.2\n' };
        if (args[1] === 'jlist') return { stdout: JSON.stringify(processes) };
        return { stdout: '' };
      }),
  );
  const provider = createPm2Provider({
    cli,
    locate: async () => ENTRY,
    daemonRunning: () => daemon,
    isProtectedPid: (pid) => protectedPids.includes(pid),
    now: () => NOW,
    nodeExecutable: NODE,
  });
  return { cli, provider };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;

test('RF-19: detecta a versão e se o daemon está ativo, executando o script com o próprio node', async () => {
  const { provider, cli } = setup();
  assert.deepEqual(await provider.detect(), { disponivel: true, versao: '5.4.2', info: { daemon: true } });
  assert.equal(cli.calls[0].executable, NODE, 'nunca executa o .cmd, que o Node recusa sem shell');
  assert.deepEqual(cli.calls[0].args, [ENTRY, '--version']);
  assert.equal((await setup({ daemon: false }).provider.detect()).info.daemon, false);
});

test('RN-11: pm2 não instalado resulta em provedor indisponível, sem erro', async () => {
  const provider = createPm2Provider({ cli: createFakeCli(), locate: async () => null });
  assert.deepEqual(await provider.detect(), { disponivel: false });
  await assert.rejects(provider.list(), status(404));
});

test('RF-19: detectar e listar sem daemon não iniciam o pm2 (nenhum jlist)', async () => {
  const { provider, cli } = setup({ daemon: false });
  const result = await provider.list();
  assert.match(result.contexto, /daemon do pm2 não está em execução/);
  assert.deepEqual(result.sections[0].rows, []);
  assert.deepEqual(cli.calls.filter((c) => c.args.includes('jlist')), []);
});

test('RF-19: lista os processos com estado, métricas formatadas e ações por estado', async () => {
  const { provider, cli } = setup({
    processes: [
      proc(),
      proc({ name: 'worker', pm_id: 1, pid: 0, env: { status: 'stopped' }, monit: { memory: 0, cpu: 0 } }),
      proc({ name: 'quebrado', pm_id: 2, pid: 0, env: { status: 'errored', restart_time: 15 } }),
      proc({ name: 'subindo', pm_id: 3, env: { status: 'launching' } }),
    ],
  });
  const { sections } = await provider.list();
  assert.deepEqual(cli.calls[0].args, [ENTRY, 'jlist']);
  const [api, worker, quebrado, subindo] = sections[0].rows;

  assert.deepEqual(api.cells, { nome: 'api', id: '0', modo: 'fork', cpu: '1.5%', mem: '50 MB', restarts: 2, uptime: '1h 2min', pid: 5000 });
  assert.deepEqual(api.status, { texto: 'Online', tom: 'ok' });
  assert.deepEqual(api.actions, ['restart', 'stop', 'delete']);
  assert.equal(api.logs, true);

  assert.deepEqual(worker.status, { texto: 'Parado', tom: 'off' });
  assert.deepEqual(worker.actions, ['start', 'delete']);
  assert.equal(worker.cells.uptime, '—');
  assert.equal(worker.cells.pid, '—');
  assert.deepEqual(quebrado.status, { texto: 'Com erro', tom: 'mau' });
  assert.deepEqual(quebrado.actions, ['start', 'delete']);
  assert.deepEqual(subindo.actions, ['stop']);
  assert.deepEqual(sections[0].columns.map((c) => c.key), ['nome', 'id', 'modo', 'cpu', 'mem', 'restarts', 'uptime', 'pid']);
});

test('RF-19: ignora ruído antes do JSON e trata lista vazia ou resposta inválida', async () => {
  const noisy = setup({ handler: (e, args) => (args[1] === 'jlist' ? { stdout: '[PM2] Spawning PM2 daemon\n[PM2] Done.\n[]' } : { stdout: '' }) });
  assert.deepEqual((await noisy.provider.list()).sections[0].rows, []);
  const empty = setup({ handler: () => ({ stdout: '' }) });
  assert.deepEqual((await empty.provider.list()).sections[0].rows, []);
  const bad = setup({ handler: () => ({ stdout: '[ isto não é json' }) });
  await assert.rejects(bad.provider.list(), status(502));
  assert.deepEqual(parseJlist('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(parseJlist('sem nenhum colchete'), [], 'sem lista JSON não há processos');
  assert.deepEqual(parseJlist('[PM2] aviso [x]\n[PM2] outro\n[{"a":[1,2]}]'), [{ a: [1, 2] }], 'colchetes dentro do ruído e do JSON');
  assert.throws(() => parseJlist(`${'[PM2] ruído\n'.repeat(30)}[]`), status(502), 'ruído demais é recusado em vez de varrer tudo');
});

test('RN-04: o processo do painel aparece marcado e sem ações', async () => {
  const { provider } = setup({ processes: [proc({ name: 'painel', pm_id: 7, pid: 4242 }), proc({ pm_id: 8, pid: 99 })], protectedPids: [4242] });
  const [painel, outro] = (await provider.list()).sections[0].rows;
  assert.equal(painel.cells.nome, 'painel (painel)');
  assert.deepEqual(painel.actions, []);
  assert.deepEqual(outro.actions, ['restart', 'stop', 'delete']);
});

test('RN-12: cada operação monta exatamente os argumentos esperados, com o node e o script', async () => {
  const { provider, cli } = setup({ processes: [proc({ pm_id: 3, pid: 5003 })] });
  for (const op of ['start', 'restart', 'stop', 'delete']) await provider.actions[op].run('3');
  const acted = cli.calls.filter((c) => !c.args.includes('jlist'));
  assert.deepEqual(acted.map((c) => [c.executable, ...c.args]), [
    [NODE, ENTRY, 'start', '3'],
    [NODE, ENTRY, 'restart', '3'],
    [NODE, ENTRY, 'stop', '3'],
    [NODE, ENTRY, 'delete', '3'],
  ]);
});

test('RN-04: parar, reiniciar ou excluir o processo do painel é recusado antes de chamar o pm2', async () => {
  const { provider, cli } = setup({ processes: [proc({ pm_id: 7, pid: 4242 })], protectedPids: [4242] });
  for (const op of ['stop', 'restart', 'delete']) {
    await assert.rejects(provider.actions[op].run('7'), status(409), op);
  }
  assert.equal(cli.calls.some((c) => ['stop', 'restart', 'delete'].includes(c.args[1])), false);
});

test('RN-04: processos comuns, ids desconhecidos e daemon parado não são bloqueados pela guarda', async () => {
  const { provider, cli } = setup({ processes: [proc({ pm_id: 1, pid: 111 })], protectedPids: [4242] });
  await provider.actions.stop.run('1');
  await provider.actions.stop.run('99'); // quem decide se existe é o pm2
  assert.deepEqual(cli.calls.filter((c) => c.args[1] === 'stop').map((c) => c.args[2]), ['1', '99']);
  const down = setup({ daemon: false, protectedPids: [4242] });
  await down.provider.actions.stop.run('1');
  assert.equal(down.cli.calls.some((c) => c.args.includes('jlist')), false);
});

test('RN-12: o id precisa ser numérico (nada de nomes, opções ou injeção)', () => {
  const { provider } = setup();
  for (const id of ['0', '12', '123456789']) assert.equal(provider.validateId(id), id);
  for (const id of ['', '-1', '1.5', 'abc', '0; calc', '--all', 'all', '1234567890', ' 1', undefined, 5, null]) {
    assert.throws(() => provider.validateId(id), status(400), JSON.stringify(id));
  }
});

test('RN-05: parar e excluir são destrutivas; iniciar e reiniciar não', () => {
  const { provider } = setup();
  assert.deepEqual(
    Object.entries(provider.actions).map(([op, a]) => [op, a.destrutiva]),
    [['start', false], ['restart', false], ['stop', true], ['delete', true]],
  );
});

test('RF-19: logs pedem as últimas 300 linhas, sem fluxo contínuo e sem cores', async () => {
  const { provider, cli } = setup({ handler: () => ({ stdout: 'saída\n', stderr: 'erro\n' }) });
  assert.equal(await provider.logs('3'), 'saída\nerro\n');
  assert.deepEqual(cli.calls[0].args, [ENTRY, 'logs', '3', '--lines', '300', '--nostream', '--no-color']);
});

test('RN-14: se o pm2 sumir durante o uso, o script é localizado de novo na chamada seguinte', async () => {
  let located = 0;
  let fail = true;
  const cli = createFakeCli(() => {
    if (fail) throw new HttpError(502, 'Cannot find module');
    return { stdout: '[]' };
  });
  const provider = createPm2Provider({ cli, locate: async () => (located += 1, ENTRY), daemonRunning: () => true, nodeExecutable: NODE });
  await assert.rejects(provider.list(), status(502));
  fail = false;
  await provider.list();
  assert.equal(located, 2);
});

test('RF-19: durações legíveis', () => {
  assert.deepEqual([0, 59, 60, 3599, 3600, 3725, 86399, 86400, 90000, 200000].map(humanDuration), [
    '0s', '59s', '1min', '59min', '1h 0min', '1h 2min', '23h 59min', '1d 0h', '1d 1h', '2d 7h',
  ]);
});

// ---------- localizador ----------

const sep = path.sep;
const entryIn = (dir) => path.join(dir, 'node_modules', 'pm2', 'bin', 'pm2');

function locator({ present = [], where, configured = '', env = {}, nodeDir = 'C:\\node' }) {
  const cli = createFakeCli(() => {
    if (where instanceof Error) throw where;
    return { stdout: where || '' };
  });
  const locate = createPm2Locator({ cli, configured, env, nodeDir, exists: (file) => present.includes(file) });
  return { locate, cli };
}

test('RF-19: o localizador respeita a configuração e a variável de ambiente (basename pm2)', async () => {
  const configured = `C:${sep}x${sep}bin${sep}pm2`;
  assert.equal(await locator({ present: [configured], configured }).locate(), configured);
  const fromEnv = `D:${sep}y${sep}pm2`;
  assert.equal(await locator({ present: [fromEnv], env: { PAINEL_PM2_ENTRY: fromEnv } }).locate(), fromEnv);
});

test('RN-12: a configuração só vale se o arquivo for chamado pm2 e existir', async () => {
  const wrongName = `C:${sep}x${sep}outro.js`;
  assert.equal(await locator({ present: [wrongName], configured: wrongName }).locate(), null);
  const missing = `C:${sep}x${sep}pm2`;
  assert.equal(await locator({ present: [], configured: missing }).locate(), null);
});

test('RF-19: o localizador usa o `where pm2.cmd` para achar o script ao lado do .cmd', async () => {
  const dir = 'C:\\Users\\alguem\\AppData\\Roaming\\npm';
  const { locate, cli } = locator({ present: [entryIn(dir)], where: `${dir}\\pm2.cmd\r\n` });
  assert.equal(await locate(), entryIn(dir));
  assert.deepEqual([cli.calls[0].executable, ...cli.calls[0].args], ['where.exe', 'pm2.cmd']);
});

test('RF-19: sem `where`, procura na pasta do node (prefixo global do WinGet) e nas pastas do npm', async () => {
  const nodeDir = 'C:\\node';
  assert.equal(await locator({ present: [entryIn(nodeDir)], where: new HttpError(502, 'não achou'), nodeDir }).locate(), entryIn(nodeDir));
  const appdata = 'C:\\Users\\u\\AppData\\Roaming';
  const viaAppData = locator({ present: [entryIn(`${appdata}\\npm`)], where: new HttpError(502, 'x'), env: { APPDATA: appdata } });
  assert.equal(await viaAppData.locate(), entryIn(`${appdata}\\npm`));
});

test('RN-11: nada encontrado devolve null', async () => {
  assert.equal(await locator({ where: new HttpError(404, 'where.exe ausente') }).locate(), null);
});

// ---------- daemon do pm2 (arquivo de PID) ----------

const fs = require('node:fs');
const os = require('node:os');
const { defaultDaemonRunning, pm2Home } = require('../../../src/providers/pm2');

function fakeHome(pidFileContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-pm2home-'));
  if (pidFileContent !== undefined) fs.writeFileSync(path.join(dir, 'pm2.pid'), pidFileContent);
  return dir;
}

test('RF-19: o daemon é considerado ativo quando o pm2.pid aponta para um processo vivo', () => {
  const home = fakeHome(`${process.pid}\n`);
  assert.equal(defaultDaemonRunning({ PM2_HOME: home }), true);
  fs.rmSync(home, { recursive: true, force: true });
});

test('RF-19: sem pm2.pid, com conteúdo inválido ou com PID inexistente o daemon está parado', () => {
  for (const content of [undefined, '', 'lixo', '-5', '0', '2147483646']) {
    const home = fakeHome(content);
    assert.equal(defaultDaemonRunning({ PM2_HOME: home }), false, String(content));
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('RF-19: a pasta do pm2 respeita PM2_HOME e cai para .pm2 no perfil do usuário', () => {
  assert.equal(pm2Home({ PM2_HOME: path.join('D:', 'meu-pm2') }), path.join('D:', 'meu-pm2'));
  assert.equal(pm2Home({ USERPROFILE: path.join('C:', 'perfil') }), path.join('C:', 'perfil', '.pm2'));
  assert.equal(pm2Home({ HOME: path.join('C:', 'casa'), USERPROFILE: path.join('C:', 'perfil') }), path.join('C:', 'casa', '.pm2'));
});
