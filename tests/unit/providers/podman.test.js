'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPodmanProvider, friendly, formatPorts, humanSize, parseArray } = require('../../../src/providers/podman');
const { createFakeCli } = require('../../helpers/fake-cli');
const { HttpError } = require('../../../src/validate');

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);

const PS = JSON.stringify([
  {
    Id: ID_A,
    Names: ['web'],
    Image: 'docker.io/library/nginx:stable',
    State: 'running',
    Status: 'Up 2 hours',
    Ports: [{ host_ip: '', host_port: 8080, container_port: 80, protocol: 'tcp', range: 1 }, { container_port: 443, protocol: 'tcp' }],
  },
  { Id: ID_B, Names: ['banco'], Image: 'docker.io/library/postgres:16', State: 'exited', Status: 'Exited (0) 1 day ago', Ports: null },
  { Id: 'c'.repeat(64), Names: null, Image: 'redis', State: 'Created', Ports: [] },
]);

const IMAGES = JSON.stringify([
  { Id: 'd'.repeat(64), RepoTags: ['docker.io/library/nginx:stable'], Size: 190_000_000 },
  { Id: `sha256:${'e'.repeat(64)}`, Names: ['localhost/app:dev'], Size: 1_500_000_000 },
  { Id: 'f'.repeat(64), RepoTags: null, Names: null, Size: 900 },
]);

const ENGINE_DOWN = 'Cannot connect to Podman. Please verify your connection to the Linux system using `podman system connection list`, or try `podman machine init` and `podman machine start`';

function provider(handler) {
  const cli = createFakeCli(handler);
  return { cli, podman: createPodmanProvider({ cli }) };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;

test('RF-21: detecta a versão da CLI e o motor (podman machine) em execução', async () => {
  const { podman, cli } = provider((exe, args) => (args[0] === '--version' ? { stdout: 'podman version 5.2.0\n' } : { stdout: '5.2.0\n' }));
  assert.deepEqual(await podman.detect(), { disponivel: true, versao: '5.2.0', info: { motor: true } });
  assert.deepEqual(cli.calls.map((c) => [c.executable, ...c.args]), [['podman', '--version'], ['podman', 'info', '--format', '{{.Version.Version}}']]);
});

test('RF-21: CLI instalada com a máquina parada continua disponível, com motor parado', async () => {
  const { podman } = provider((exe, args) => {
    if (args[0] === '--version') return { stdout: 'podman version 5.2.0\n' };
    throw new HttpError(502, ENGINE_DOWN);
  });
  assert.deepEqual(await podman.detect(), { disponivel: true, versao: '5.2.0', info: { motor: false } });
});

test('RN-11: Podman não instalado resulta em provedor indisponível; outros erros sobem', async () => {
  const absent = provider(() => { throw new HttpError(404, 'podman não está instalado'); });
  assert.deepEqual(await absent.podman.detect(), { disponivel: false });
  const slow = provider(() => { throw new HttpError(504, 'Tempo esgotado'); });
  await assert.rejects(slow.podman.detect(), status(504));
});

test('RF-21: lista containers e imagens no formato de lista JSON do Podman', async () => {
  const { podman, cli } = provider((exe, args) => ({ stdout: args[0] === 'ps' ? PS : IMAGES }));
  const [containers, images] = (await podman.list()).sections;
  assert.deepEqual(cli.calls.map((c) => c.args).sort(), [['images', '--format', 'json'], ['ps', '-a', '--format', 'json']]);

  const [web, banco, novo] = containers.rows;
  assert.equal(web.id, 'aaaaaaaaaaaa', 'ids curtos de 12 caracteres');
  assert.deepEqual(web.cells, { nome: 'web', imagem: 'docker.io/library/nginx:stable', portas: '0.0.0.0:8080->80/tcp, 443/tcp', estado: 'Up 2 hours' });
  assert.deepEqual(web.status, { texto: 'Em execução', tom: 'ok' });
  assert.deepEqual(web.actions, ['stop', 'restart']);
  assert.equal(web.logs, true);
  assert.equal(banco.cells.portas, '—');
  assert.deepEqual(banco.status, { texto: 'Parado', tom: 'off' });
  assert.deepEqual(banco.actions, ['start', 'rm']);
  assert.equal(novo.cells.nome, 'cccccccccccc', 'sem nome usa o id curto');
  assert.deepEqual(novo.status, { texto: 'Criado', tom: 'off' }, 'estado normalizado para minúsculas');

  assert.deepEqual(images.rows.map((r) => [r.id, r.cells.nome, r.cells.tamanho, r.actions]), [
    ['dddddddddddd', 'docker.io/library/nginx:stable', '190MB', ['rmi']],
    ['eeeeeeeeeeee', 'localhost/app:dev', '1.5GB', ['rmi']],
    ['ffffffffffff', '<none>:<none>', '900B', ['rmi']],
  ]);
});

test('RF-21: lista vazia, null e resposta inválida', async () => {
  for (const empty of ['', '[]', 'null', '  \n']) {
    const { podman } = provider(() => ({ stdout: empty }));
    assert.deepEqual((await podman.list()).sections.map((s) => s.rows.length), [0, 0], JSON.stringify(empty));
  }
  const bad = provider(() => ({ stdout: '{ não é lista' }));
  await assert.rejects(bad.podman.list(), status(502));
  assert.deepEqual(parseArray('{"a":1}'), [], 'objeto solto não é lista de containers');
});

test('RN-12: cada operação monta exatamente os argumentos esperados, sem forçar nada', async () => {
  const { podman, cli } = provider(() => ({ stdout: '' }));
  for (const op of ['start', 'stop', 'restart', 'rm', 'rmi']) await podman.actions[op].run('aaaaaaaaaaaa');
  assert.deepEqual(cli.calls.map((c) => [c.executable, ...c.args]), [
    ['podman', 'start', 'aaaaaaaaaaaa'],
    ['podman', 'stop', 'aaaaaaaaaaaa'],
    ['podman', 'restart', 'aaaaaaaaaaaa'],
    ['podman', 'rm', 'aaaaaaaaaaaa'],
    ['podman', 'rmi', 'aaaaaaaaaaaa'],
  ]);
  assert.equal(cli.calls.some((c) => c.args.includes('-f') || c.args.includes('--force')), false);
});

test('RN-05: parar, remover e remover imagem são destrutivas; iniciar e reiniciar não', () => {
  const { podman } = provider(() => ({}));
  assert.deepEqual(Object.entries(podman.actions).map(([op, a]) => [op, a.destrutiva]), [['start', false], ['stop', true], ['restart', false], ['rm', true], ['rmi', true]]);
});

test('RF-21: logs pedem as últimas 300 linhas com horário e juntam stdout e stderr', async () => {
  const { podman, cli } = provider(() => ({ stdout: 'saída\n', stderr: 'erro\n' }));
  assert.equal(await podman.logs('aaaaaaaaaaaa'), 'saída\nerro\n');
  assert.deepEqual(cli.calls[0].args, ['logs', '--tail', '300', '--timestamps', 'aaaaaaaaaaaa']);
});

test('UC-10: máquina parada vira mensagem amigável 503 em todas as operações, sem o erro bruto', async () => {
  const { podman } = provider(() => { throw new HttpError(502, ENGINE_DOWN); });
  for (const call of [() => podman.list(), () => podman.logs('abc'), () => podman.actions.stop.run('abc')]) {
    await assert.rejects(call(), (e) => {
      assert.equal(e.status, 503);
      assert.match(e.message, /podman machine start/);
      assert.equal(e.message.includes('connection list'), false);
      return true;
    });
  }
});

test('UC-10: friendly reconhece variações e não altera outros erros', () => {
  for (const text of [
    'Error: unable to connect to Podman socket: failed to connect: dial tcp 127.0.0.1:50000: connectex: connection refused',
    'Cannot connect to Podman. Please verify your connection',
    'Error: unable to connect to Podman socket: npipe:////./pipe/podman-machine-default',
    'the system cannot find the file specified',
  ]) {
    assert.equal(friendly(new HttpError(502, text)).status, 503, text);
  }
  const other = new HttpError(502, 'Error: no container with name or ID "x" found');
  assert.equal(friendly(other), other);
  const notFound = new HttpError(404, 'podman não está instalado');
  assert.equal(friendly(notFound), notFound);
});

test('RF-21: formatadores de portas e tamanhos', () => {
  assert.equal(formatPorts(null), '');
  assert.equal(formatPorts([]), '');
  assert.equal(formatPorts([{ host_ip: '127.0.0.1', host_port: 9000, container_port: 90 }]), '127.0.0.1:9000->90/tcp');
  assert.equal(formatPorts([{ container_port: 53, protocol: 'udp' }]), '53/udp');
  assert.deepEqual([0, 999, 1500, 190_000_000, 2_500_000_000].map(humanSize), ['0B', '999B', '2kB', '190MB', '2.5GB']);
  assert.deepEqual(['x', -1, NaN, undefined].map(humanSize), ['—', '—', '—', '—']);
});
