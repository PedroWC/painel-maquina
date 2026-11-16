'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWslProvider, parseVerbose, ALL } = require('../../../src/providers/wsl');
const { createFakeCli } = require('../../helpers/fake-cli');
const { HttpError } = require('../../../src/validate');

const VERBOSE = [
  '  NAME              STATE           VERSION',
  '* Ubuntu            Running         2',
  '  Debian            Stopped         2',
  '  docker-desktop    Stopped         2',
  '  Ubuntu-22.04      Running         1',
  '',
].join('\r\n');

const VERBOSE_PT = ['  NOME              ESTADO          VERSÃO', '* Ubuntu            Em execução     2', '  Debian            Parado          2', ''].join('\r\n');

function router({ verbose = VERBOSE, running = 'Ubuntu\r\nUbuntu-22.04\r\n', fail } = {}) {
  return (exe, args) => {
    const failure = fail && fail(args);
    if (failure) throw failure;
    if (args[0] === '--version') return { stdout: 'Versão do WSL: 3.0.5.0\r\nVersão do kernel: 6.18.58.1-1\r\n' };
    if (args[0] === '--list' && args.includes('--verbose')) return { stdout: verbose };
    if (args[0] === '--list' && args.includes('--running')) return { stdout: running };
    if (args[0] === '--list') return { stdout: 'Ubuntu\r\nDebian\r\n' };
    return { stdout: '' };
  };
}

function setup(options) {
  const cli = createFakeCli(router(options));
  return { cli, provider: createWslProvider({ cli }) };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;
const rowsOf = (result) => Object.fromEntries(result.sections[0].rows.map((r) => [r.id, r]));

test('RF-22: detecta a versão do WSL mesmo com a saída traduzida', async () => {
  const { provider, cli } = setup();
  assert.deepEqual(await provider.detect(), { disponivel: true, versao: '3.0.5.0' });
  assert.deepEqual([cli.calls[0].executable, ...cli.calls[0].args], ['wsl.exe', '--version']);
  assert.equal(cli.calls[0].options.encoding, 'auto', 'a saída do wsl.exe é UTF-16');
});

test('RF-22: WSL antigo (sem --version) ainda é detectado pela listagem', async () => {
  const cli = createFakeCli((exe, args) => {
    if (args[0] === '--version') throw new HttpError(502, 'Argumento inválido');
    return { stdout: 'Ubuntu\r\n' };
  });
  assert.deepEqual(await createWslProvider({ cli }).detect(), { disponivel: true, versao: 'legado' });
});

test('RN-11: sem wsl.exe ou sem o recurso instalado o provedor fica indisponível, sem erro', async () => {
  const absent = createWslProvider({ cli: createFakeCli(() => { throw new HttpError(404, 'wsl.exe não está instalado'); }) });
  assert.deepEqual(await absent.detect(), { disponivel: false });
  const notInstalled = createWslProvider({ cli: createFakeCli(() => { throw new HttpError(502, 'O WSL não está instalado'); }) });
  assert.deepEqual(await notInstalled.detect(), { disponivel: false });
  const slow = createWslProvider({ cli: createFakeCli(() => { throw new HttpError(504, 'Tempo esgotado'); }) });
  await assert.rejects(slow.detect(), status(504));
});

test('RF-22: versão ilegível não derruba a detecção', async () => {
  const cli = createFakeCli(() => ({ stdout: 'saída sem número' }));
  assert.deepEqual(await createWslProvider({ cli }).detect(), { disponivel: true, versao: 'desconhecida' });
});

test('RF-22: o parser lê a saída real e a traduzida, sem confundir cabeçalho nem mensagens', () => {
  assert.deepEqual(parseVerbose(VERBOSE).map((d) => [d.name, d.version, d.isDefault]), [
    ['Ubuntu', '2', true],
    ['Debian', '2', false],
    ['docker-desktop', '2', false],
    ['Ubuntu-22.04', '1', false],
  ]);
  assert.deepEqual(parseVerbose(VERBOSE_PT).map((d) => d.name), ['Ubuntu', 'Debian']);
  assert.deepEqual(parseVerbose('O Subsistema do Windows para Linux não tem distribuições instaladas.\r\n'), []);
  assert.deepEqual(parseVerbose(''), []);
  assert.deepEqual(parseVerbose('* Ub\0untu    Running    2').map((d) => d.name), ['Ubuntu'], 'bytes nulos perdidos são ignorados');
  assert.deepEqual(parseVerbose('  --opcao    Running    2'), [], 'nome que viraria opção é descartado');
});

test('RF-22: lista as distribuições com versão, padrão e estado vindo de --running', async () => {
  const { provider, cli } = setup();
  const result = await provider.list();
  assert.deepEqual(cli.calls.map((c) => c.args), [['--list', '--verbose'], ['--list', '--running', '--quiet']]);
  const rows = rowsOf(result);
  assert.deepEqual(rows.Ubuntu.cells, { nome: 'Ubuntu (padrão)', versao: 'WSL 2' });
  assert.deepEqual(rows.Ubuntu.status, { texto: 'Em execução', tom: 'ok' });
  assert.deepEqual(rows.Ubuntu.actions, ['terminate']);
  assert.deepEqual(rows.Debian.status, { texto: 'Parada', tom: 'off' });
  assert.deepEqual(rows.Debian.actions, []);
  assert.equal(rows['Ubuntu-22.04'].cells.versao, 'WSL 1');
  assert.deepEqual(rows['Ubuntu-22.04'].status, { texto: 'Em execução', tom: 'ok' });
});

test('RF-22: toda distribuição oferece abrir terminal, mesmo parada (o wsl -d a inicia)', async () => {
  const rows = rowsOf(await setup().provider.list());
  assert.deepEqual(rows.Debian.terminal, { shell: 'wsl', distro: 'Debian' });
  assert.deepEqual(rows.Ubuntu.terminal, { shell: 'wsl', distro: 'Ubuntu' });
});

test('RF-22: o estado não depende do idioma: mensagem de "nenhuma em execução" não vira distribuição', async () => {
  const { provider } = setup({ verbose: VERBOSE_PT, running: 'Não há distribuições em execução.\r\n' });
  const rows = (await provider.list()).sections[0].rows;
  assert.deepEqual(rows.map((r) => [r.id, r.status.texto]), [['Ubuntu', 'Parada'], ['Debian', 'Parada']]);
  const none = setup({ running: '' });
  assert.equal(Object.values(rowsOf(await none.provider.list())).every((r) => r.status.texto === 'Parada'), true);
});

test('RF-22: falha ao consultar quem está em execução não impede a listagem', async () => {
  const { provider } = setup({ fail: (args) => (args.includes('--running') ? new HttpError(502, 'erro') : null) });
  const rows = (await provider.list()).sections[0].rows;
  assert.equal(rows.length, 4);
  assert.equal(rows.every((r) => r.status.texto === 'Parada'), true);
});

test('RF-22: a seção Geral oferece desligar o WSL com confirmação "wsl"; sem distribuições ela não aparece', async () => {
  const result = await setup().provider.list();
  const [, geral] = result.sections;
  assert.equal(geral.id, 'geral');
  assert.deepEqual([geral.rows[0].id, geral.rows[0].actions, geral.rows[0].nomeConfirmacao], [ALL, ['shutdown'], 'wsl']);
  const empty = await setup({ verbose: '  NAME  STATE  VERSION\r\n' }).provider.list();
  assert.equal(empty.sections.length, 1);
  assert.deepEqual(empty.sections[0].rows, []);
});

test('RN-14: "nenhuma distribuição instalada" (erro do wsl.exe) vira aviso, não falha', async () => {
  const { provider } = setup({ fail: (args) => (args.includes('--verbose') ? new HttpError(502, 'O WSL não tem distribuições instaladas.') : null) });
  const result = await provider.list();
  assert.match(result.aviso, /não tem distribuições/);
  assert.deepEqual(result.sections[0].rows, []);
  const timeout = setup({ fail: (args) => (args.includes('--verbose') ? new HttpError(504, 'Tempo esgotado') : null) });
  await assert.rejects(timeout.provider.list(), status(504));
});

test('RN-12: encerrar e desligar montam exatamente os argumentos esperados, sempre com UTF-16', async () => {
  const { provider, cli } = setup();
  await provider.actions.terminate.run('Ubuntu-22.04');
  await provider.actions.shutdown.run(ALL);
  assert.deepEqual(cli.calls.map((c) => [c.executable, ...c.args]), [
    ['wsl.exe', '--terminate', 'Ubuntu-22.04'],
    ['wsl.exe', '--shutdown'],
  ]);
  assert.equal(cli.calls.every((c) => c.options.encoding === 'auto'), true);
});

test('RN-12: encerrar não vale para "todas" e desligar não vale para uma distribuição', async () => {
  const { provider, cli } = setup();
  await assert.rejects(provider.actions.terminate.run(ALL), status(400));
  await assert.rejects(provider.actions.shutdown.run('Ubuntu'), status(400));
  assert.equal(cli.calls.length, 0);
});

test('RN-12: o id é um nome de distribuição seguro ou o marcador de "todas"', () => {
  const { provider } = setup();
  for (const id of ['Ubuntu', 'Ubuntu-22.04', 'docker-desktop', 'kali_linux', ALL]) assert.equal(provider.validateId(id), id);
  for (const id of ['', '-d', '--shutdown', 'a b', 'a;b', '../x', 'a'.repeat(65), '_outra', undefined, null, 5]) {
    assert.throws(() => provider.validateId(id), status(400), JSON.stringify(id));
  }
});

test('RN-05: encerrar e desligar são destrutivas; desligar exige digitar "wsl"', () => {
  const { provider } = setup();
  assert.deepEqual(Object.entries(provider.actions).map(([op, a]) => [op, a.destrutiva, Boolean(a.confirmarNome)]), [
    ['terminate', true, false],
    ['shutdown', true, true],
  ]);
  assert.equal(provider.nomeConfirmacao(ALL), 'wsl');
  assert.equal(provider.nomeConfirmacao('Ubuntu'), 'Ubuntu');
  assert.ok(provider.timeoutMs >= 30000, 'o desligamento pode demorar');
});
