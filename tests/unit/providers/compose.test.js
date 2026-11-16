'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createComposeProvider, parseId, parseJson, runningCount } = require('../../../src/providers/compose');
const { createFakeCli } = require('../../helpers/fake-cli');
const { HttpError } = require('../../../src/validate');

const FILE_A = 'C:\\apps\\loja\\docker-compose.yml';
const FILE_B = 'C:\\apps\\loja\\docker-compose.override.yml';

const PROJECTS = JSON.stringify([
  { Name: 'loja', Status: 'running(2), exited(1)', ConfigFiles: `${FILE_A},${FILE_B}` },
  { Name: 'blog', Status: 'exited(2)', ConfigFiles: 'C:\\apps\\blog\\compose.yaml' },
  { Name: 'sem-arquivo', Status: 'running(1)', ConfigFiles: '' },
]);

const PS = {
  loja: [
    { Name: 'loja-web-1', Service: 'web', State: 'running', Status: 'Up 2 hours', Image: 'nginx', Publishers: [{ URL: '0.0.0.0', TargetPort: 80, PublishedPort: 8080, Protocol: 'tcp' }, { TargetPort: 443, PublishedPort: 0, Protocol: 'tcp' }] },
    { Name: 'loja-db-1', Service: 'db', State: 'exited', Status: 'Exited (0) 1 hour ago', Image: 'postgres:16', Publishers: [] },
  ],
  blog: [],
  'sem-arquivo': [{ Name: 'x-1', Service: 'app', State: 'running', Status: 'Up', Image: 'app' }],
};

const ENGINE_DOWN = 'failed to connect to the docker API at npipe:////./pipe/docker_engine';

function router({ projects = PROJECTS, ps = PS, fail, psAsLines = false } = {}) {
  return (exe, args) => {
    const failure = fail && fail(args);
    if (failure) throw failure;
    if (args.join(' ') === 'compose version --short') return { stdout: 'v2.29.1\n' };
    if (args[1] === 'ls') return { stdout: projects };
    const verb = args.find((a) => ['ps', 'logs', 'up', 'stop', 'restart'].includes(a));
    if (verb === 'ps') {
      const rows = ps[args[args.indexOf('-p') + 1]] || [];
      return { stdout: psAsLines ? rows.map((r) => JSON.stringify(r)).join('\n') : JSON.stringify(rows) };
    }
    if (verb === 'logs') return { stdout: 'log\n', stderr: 'aviso\n' };
    return { stdout: '' };
  };
}

function setup(options) {
  const cli = createFakeCli(router(options));
  return { cli, provider: createComposeProvider({ cli }) };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;
const acted = (cli) => cli.calls.filter((c) => c.args.some((a) => ['up', 'stop', 'restart'].includes(a)));

test('RF-18: detecta o plugin e a versão (sem o "v" inicial)', async () => {
  const { provider, cli } = setup();
  assert.deepEqual(await provider.detect(), { disponivel: true, versao: '2.29.1' });
  assert.deepEqual([cli.calls[0].executable, ...cli.calls[0].args], ['docker', 'compose', 'version', '--short']);
});

test('RN-11: sem docker ou com docker sem o plugin o provedor fica indisponível, sem erro', async () => {
  const noDocker = createComposeProvider({ cli: createFakeCli(() => { throw new HttpError(404, 'docker não está instalado'); }) });
  assert.deepEqual(await noDocker.detect(), { disponivel: false });
  const noPlugin = createComposeProvider({ cli: createFakeCli(() => { throw new HttpError(502, 'docker: unknown command: docker compose'); }) });
  assert.deepEqual(await noPlugin.detect(), { disponivel: false });
  const slow = createComposeProvider({ cli: createFakeCli(() => { throw new HttpError(504, 'Tempo esgotado'); }) });
  await assert.rejects(slow.detect(), status(504));
});

test('RF-18: lista projetos com estado, arquivo principal e ações conforme estejam rodando', async () => {
  const { provider, cli } = setup();
  const [projetos] = (await provider.list()).sections;
  assert.deepEqual(cli.calls[0].args, ['compose', 'ls', '--all', '--format', 'json']);
  const [loja, blog, semArquivo] = projetos.rows;
  assert.deepEqual(loja.cells, { nome: 'loja', estado: 'running(2), exited(1)', arquivo: FILE_A });
  assert.deepEqual(loja.status, { texto: '2 em execução', tom: 'ok' });
  assert.deepEqual(loja.actions, ['up', 'restart', 'stop']);
  assert.equal(loja.logs, true);
  assert.deepEqual(blog.status, { texto: 'Parado', tom: 'off' });
  assert.deepEqual(blog.actions, ['up']);
  assert.equal(semArquivo.cells.arquivo, '—');
});

test('RF-18: lista os serviços de cada projeto, com portas publicadas, e aceita os dois formatos do ps', async () => {
  for (const psAsLines of [false, true]) {
    const { provider } = setup({ psAsLines });
    const services = (await provider.list()).sections[1].rows;
    assert.deepEqual(services.map((r) => r.id), ['loja/web', 'loja/db', 'sem-arquivo/app']);
    assert.deepEqual(services[0].cells, { projeto: 'loja', servico: 'web', imagem: 'nginx', portas: '0.0.0.0:8080->80/tcp', estado: 'Up 2 hours' });
    assert.deepEqual(services[0].status, { texto: 'Em execução', tom: 'ok' });
    assert.deepEqual(services[1].status, { texto: 'Parado', tom: 'off' });
    assert.deepEqual(services[1].actions, []);
    assert.equal(services[1].logs, true);
  }
});

test('RF-18: consulta os serviços de cada projeto com -p e --all', async () => {
  const { provider, cli } = setup();
  await provider.list();
  const asked = cli.calls.filter((c) => c.args.includes('ps')).map((c) => c.args);
  assert.deepEqual(asked.map((a) => a[a.indexOf('-p') + 1]).sort(), ['blog', 'loja', 'sem-arquivo']);
  assert.ok(asked.every((a) => a.includes('--all') && a.includes('--format') && a.includes('json')));
});

test('RN-14: projeto que some no meio da consulta não derruba a listagem; motor parado sobe como 503', async () => {
  const gone = setup({ fail: (args) => (args.includes('ps') && args.includes('blog') ? new HttpError(502, 'no such project') : null) });
  assert.equal((await gone.provider.list()).sections[1].rows.length, 3);
  const down = setup({ fail: () => new HttpError(502, ENGINE_DOWN) });
  await assert.rejects(down.provider.list(), (e) => e.status === 503 && /motor não está respondendo/.test(e.message));
});

test('RF-18: sem projetos, projetos com nome estranho e lista inválida', async () => {
  assert.deepEqual((await setup({ projects: '[]' }).provider.list()).sections.map((s) => s.rows.length), [0, 0]);
  assert.deepEqual((await setup({ projects: '' }).provider.list()).sections.map((s) => s.rows.length), [0, 0]);
  const weird = JSON.stringify([{ Name: '../x; calc', Status: 'running(1)' }, { Name: 'ok', Status: 'running(1)' }]);
  assert.deepEqual((await setup({ projects: weird }).provider.list()).sections[0].rows.map((r) => r.id), ['ok']);
  await assert.rejects(setup({ projects: '{ não é json' }).provider.list(), status(502));
  assert.deepEqual(parseJson('{"a":1}'), [{ a: 1 }]);
});

test('RN-12: subir usa os arquivos da LISTAGEM do Compose, --no-build e tempo maior', async () => {
  const { provider, cli } = setup();
  await provider.actions.up.run('loja');
  const [up] = acted(cli);
  assert.deepEqual(up.args, ['compose', '-p', 'loja', `--file=${FILE_A}`, `--file=${FILE_B}`, 'up', '-d', '--no-build']);
  assert.equal(up.options.timeoutMs, 120000);
  assert.equal(up.args.includes('--build'), false);
  assert.ok(provider.timeoutMs > 120000, 'o limite do provedor cobre o tempo do up');
});

test('RN-12: subir recusa projeto inexistente e projeto sem arquivos absolutos conhecidos', async () => {
  const { provider, cli } = setup();
  await assert.rejects(provider.actions.up.run('nao-existe'), status(404));
  await assert.rejects(provider.actions.up.run('sem-arquivo'), status(409));
  assert.equal(acted(cli).length, 0);
  const relative = JSON.stringify([{ Name: 'rel', Status: 'exited(1)', ConfigFiles: '-evil.yml,docker-compose.yml' }]);
  const rel = setup({ projects: relative });
  await assert.rejects(rel.provider.actions.up.run('rel'), status(409));
  assert.equal(acted(rel.cli).length, 0, 'arquivo que não é caminho absoluto nunca vira argumento');
});

test('RN-12: parar e reiniciar montam exatamente os argumentos esperados (sem down, sem volumes)', async () => {
  const { provider, cli } = setup();
  await provider.actions.stop.run('loja');
  await provider.actions.restart.run('blog');
  assert.deepEqual(acted(cli).map((c) => [c.executable, ...c.args]), [
    ['docker', 'compose', '-p', 'loja', 'stop'],
    ['docker', 'compose', '-p', 'blog', 'restart'],
  ]);
  assert.equal(Object.keys(provider.actions).includes('down'), false);
  assert.equal(cli.calls.flatMap((c) => c.args).some((a) => /down|--volumes|-v$|--rmi|--force/.test(a)), false);
});

test('RN-12: ações valem para o projeto inteiro, não para um serviço', async () => {
  const { provider, cli } = setup();
  for (const op of ['up', 'stop', 'restart']) await assert.rejects(provider.actions[op].run('loja/web'), status(400), op);
  assert.equal(acted(cli).length, 0);
});

test('RN-05: parar é destrutiva; subir e reiniciar não', () => {
  const { provider } = setup();
  assert.deepEqual(Object.entries(provider.actions).map(([op, a]) => [op, a.destrutiva]), [['up', false], ['restart', false], ['stop', true]]);
});

test('RF-18: logs do projeto inteiro ou de um serviço', async () => {
  const { provider, cli } = setup();
  assert.equal(await provider.logs('loja'), 'log\naviso\n');
  await provider.logs('loja/web');
  assert.deepEqual(cli.calls[0].args, ['compose', '-p', 'loja', 'logs', '--tail', '300', '--timestamps', '--no-color']);
  assert.deepEqual(cli.calls[1].args, ['compose', '-p', 'loja', 'logs', '--tail', '300', '--timestamps', '--no-color', 'web']);
});

test('RN-12: identificadores são projeto ou projeto/serviço seguros', () => {
  const { provider } = setup();
  for (const id of ['loja', 'meu-projeto_2', 'loja/web', 'loja/db.primary', 'a/b-1']) assert.equal(provider.validateId(id), id);
  const bad = ['', '-p', '--all', 'Loja', 'a b', 'a;b', 'loja/', '/web', 'loja/web/extra', 'loja/-x', 'loja/web;calc', '../x', 'x'.repeat(64), undefined, null, 5];
  for (const id of bad) assert.throws(() => provider.validateId(id), status(400), JSON.stringify(id));
  assert.deepEqual(parseId('loja/web'), { project: 'loja', service: 'web' });
  assert.deepEqual(parseId('loja'), { project: 'loja', service: undefined });
});

test('RF-18: contagem de containers em execução a partir do estado do projeto', () => {
  assert.deepEqual(['running(2)', 'exited(1), running(3)', 'exited(2)', '', undefined, 'RUNNING(1)'].map(runningCount), [2, 3, 0, 0, 0, 1]);
});
