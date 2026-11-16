'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDockerProvider, friendly } = require('../../../src/providers/docker');
const { createFakeCli } = require('../../helpers/fake-cli');
const { HttpError } = require('../../../src/validate');

const PS = [
  { ID: 'aaa111aaa111', Names: 'web', Image: 'nginx:stable', State: 'running', Status: 'Up 2 hours', Ports: '0.0.0.0:8080->80/tcp' },
  { ID: 'bbb222bbb222', Names: 'banco', Image: 'postgres:16', State: 'exited', Status: 'Exited (0) 1 day ago', Ports: '' },
  { ID: 'ccc333ccc333', Names: 'novo', Image: 'redis', State: 'created', Status: 'Created', Ports: '' },
].map((c) => JSON.stringify(c)).join('\n');

const IMAGES = [
  { ID: 'ddd444ddd444', Repository: 'nginx', Tag: 'stable', Size: '190MB' },
  { ID: 'eee555eee555', Repository: '<none>', Tag: '<none>', Size: '12MB' },
].map((i) => JSON.stringify(i)).join('\n');

const ENGINE_DOWN = 'failed to connect to the docker API at npipe:////./pipe/docker_engine; check if the daemon is running';

function provider(handler) {
  const cli = createFakeCli(handler);
  return { cli, docker: createDockerProvider({ cli }) };
}

test('RF-15: detecta a versão da CLI e o motor em execução', async () => {
  const { docker, cli } = provider((exe, args) => {
    if (args[0] === '--version') return { stdout: 'Docker version 29.9.3, build 5457199\n' };
    return { stdout: '29.9.3\n' };
  });
  assert.deepEqual(await docker.detect(), { disponivel: true, versao: '29.9.3', info: { motor: true } });
  assert.deepEqual(cli.calls.map((c) => c.args), [['--version'], ['info', '--format', '{{.ServerVersion}}']]);
  assert.equal(cli.calls[1].options.timeoutMs, 8000);
});

test('RF-15: com a CLI instalada e o motor parado o provedor continua disponível', async () => {
  const { docker } = provider((exe, args) => {
    if (args[0] === '--version') return { stdout: 'Docker version 29.9.3, build 1\n' };
    throw new HttpError(502, ENGINE_DOWN);
  });
  assert.deepEqual(await docker.detect(), { disponivel: true, versao: '29.9.3', info: { motor: false } });
});

test('RN-11: Docker não instalado resulta em provedor indisponível, sem erro', async () => {
  const { docker } = provider(() => {
    throw new HttpError(404, 'docker não está instalado ou não está no PATH.');
  });
  assert.deepEqual(await docker.detect(), { disponivel: false });
});

test('RN-14: outros erros na detecção da CLI sobem para o registro tratar', async () => {
  const { docker } = provider(() => {
    throw new HttpError(504, 'Tempo esgotado');
  });
  await assert.rejects(docker.detect(), (e) => e.status === 504);
});

test('RF-15 e RF-16: lista containers e imagens com estado, ações por estado e logs', async () => {
  const { docker, cli } = provider((exe, args) => ({ stdout: args[0] === 'ps' ? PS : IMAGES }));
  const { sections } = await docker.list();
  const [containers, images] = sections;

  assert.deepEqual(cli.calls.map((c) => c.args.slice(0, 2)).sort(), [['images', '--format'], ['ps', '-a']]);
  assert.equal(containers.title, 'Containers');
  assert.deepEqual(containers.columns.map((c) => c.key), ['nome', 'imagem', 'portas', 'estado']);

  const [web, banco, novo] = containers.rows;
  assert.deepEqual(web.cells, { nome: 'web', imagem: 'nginx:stable', portas: '0.0.0.0:8080->80/tcp', estado: 'Up 2 hours' });
  assert.deepEqual(web.status, { texto: 'Em execução', tom: 'ok' });
  assert.deepEqual(web.actions, ['stop', 'restart']);
  assert.equal(web.logs, true);
  assert.deepEqual(banco.actions, ['start', 'rm']);
  assert.equal(banco.cells.portas, '—');
  assert.deepEqual(banco.status, { texto: 'Parado', tom: 'off' });
  assert.deepEqual(novo.actions, ['start', 'rm']);

  assert.equal(images.title, 'Imagens');
  assert.deepEqual(images.rows.map((r) => [r.id, r.cells.nome, r.cells.tamanho, r.actions]), [
    ['ddd444ddd444', 'nginx:stable', '190MB', ['rmi']],
    ['eee555eee555', '<none>:<none>', '12MB', ['rmi']],
  ]);
});

test('RF-15: lista vazia gera seções sem linhas', async () => {
  const { docker } = provider(() => ({ stdout: '' }));
  const { sections } = await docker.list();
  assert.deepEqual(sections.map((s) => s.rows.length), [0, 0]);
});

test('RN-12: cada operação monta exatamente os argumentos esperados', async () => {
  const { docker, cli } = provider(() => ({ stdout: '' }));
  for (const op of ['start', 'stop', 'restart', 'rm', 'rmi']) await docker.actions[op].run('abc123def456');
  assert.deepEqual(cli.calls.map((c) => [c.executable, ...c.args]), [
    ['docker', 'start', 'abc123def456'],
    ['docker', 'stop', 'abc123def456'],
    ['docker', 'restart', 'abc123def456'],
    ['docker', 'rm', 'abc123def456'],
    ['docker', 'rmi', 'abc123def456'],
  ]);
  assert.equal(cli.calls.some((c) => c.args.includes('-f') || c.args.includes('--force')), false, 'nunca força a remoção');
});

test('RN-05: parar, remover e remover imagem são destrutivas; iniciar e reiniciar não', () => {
  const { docker } = provider(() => ({}));
  assert.deepEqual(
    Object.entries(docker.actions).map(([op, a]) => [op, a.destrutiva]),
    [['start', false], ['stop', true], ['restart', false], ['rm', true], ['rmi', true]],
  );
});

test('RF-15: logs pedem as últimas 300 linhas com horário e juntam stdout e stderr', async () => {
  const { docker, cli } = provider(() => ({ stdout: 'saída\n', stderr: 'erro\n' }));
  assert.equal(await docker.logs('abc123def456'), 'saída\nerro\n');
  assert.deepEqual(cli.calls[0].args, ['logs', '--tail', '300', '--timestamps', 'abc123def456']);
});

test('UC-10: motor parado vira mensagem amigável 503, sem o erro técnico bruto', async () => {
  const { docker } = provider(() => {
    throw new HttpError(502, ENGINE_DOWN);
  });
  for (const call of [() => docker.list(), () => docker.logs('abc'), () => docker.actions.stop.run('abc')]) {
    await assert.rejects(call(), (e) => {
      assert.equal(e.status, 503);
      assert.match(e.message, /motor não está respondendo/);
      assert.equal(e.message.includes('npipe'), false);
      return true;
    });
  }
});

test('UC-10: friendly reconhece as variações da mensagem e não altera outros erros', () => {
  for (const text of [
    'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
    'error during connect: open //./pipe/docker_engine',
    'failed to connect to the docker API',
  ]) {
    assert.equal(friendly(new HttpError(502, text)).status, 503, text);
  }
  const other = new HttpError(502, 'No such container: x');
  assert.equal(friendly(other), other);
  const notFound = new HttpError(404, 'docker não está instalado');
  assert.equal(friendly(notFound), notFound);
  const plain = new Error('x');
  assert.equal(friendly(plain), plain);
});
