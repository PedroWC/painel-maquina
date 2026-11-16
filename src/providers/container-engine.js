'use strict';

// Lógica comum dos provedores de containers compatíveis com a CLI do Docker (Docker, Podman):
// detecção, listagem de containers e imagens, ações e logs. Cada provedor só informa o executável,
// como ler a saída da listagem e como reconhecer "motor parado". Só opera com execFile e
// argumentos validados (ADR 0010, RN-12).

const { HttpError } = require('../validate');
const { defineProvider } = require('./base');

const LOG_LINES = '300';
const ENGINE_CHECK_TIMEOUT_MS = 8000;

const STATE_LABEL = {
  running: 'Em execução',
  exited: 'Parado',
  stopped: 'Parado',
  created: 'Criado',
  configured: 'Criado',
  paused: 'Pausado',
  restarting: 'Reiniciando',
  dead: 'Inválido',
};

const stateTone = (state) => (state === 'running' ? 'ok' : 'off');

// UC-10 (exceção A): motor parado vira uma mensagem amigável, sem o erro técnico bruto.
function createFriendly(engineDown, message) {
  return (err) => (err instanceof HttpError && err.status === 502 && engineDown.test(err.message) ? new HttpError(503, message) : err);
}

// parseContainers(stdout) => [{ id, name, image, state, status, ports }]
// parseImages(stdout)     => [{ id, name, size }]
function createContainerEngineProvider({
  cli,
  id,
  nome,
  executable,
  versionPattern,
  infoArgs,
  containersArgs,
  imagesArgs,
  parseContainers,
  parseImages,
  friendly,
}) {
  async function run(args, options) {
    try {
      return await cli.run(executable, args, options);
    } catch (err) {
      throw friendly(err);
    }
  }

  async function detect() {
    let version;
    try {
      const { stdout } = await cli.run(executable, ['--version']);
      version = (stdout.match(versionPattern) || [])[1] || stdout.trim();
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { disponivel: false };
      throw err;
    }
    let motor = false;
    try {
      await cli.run(executable, infoArgs, { timeoutMs: ENGINE_CHECK_TIMEOUT_MS });
      motor = true;
    } catch {
      motor = false;
    }
    return { disponivel: true, versao: version, info: { motor } };
  }

  async function list() {
    const [ps, images] = await Promise.all([run(containersArgs), run(imagesArgs)]);
    const containers = parseContainers(ps.stdout).map((c) => ({
      id: c.id,
      cells: { nome: c.name, imagem: c.image, portas: c.ports || '—', estado: c.status },
      status: { texto: STATE_LABEL[c.state] || c.state, tom: stateTone(c.state) },
      actions: c.state === 'running' ? ['stop', 'restart'] : ['start', 'rm'],
      logs: true,
    }));
    const imgs = parseImages(images.stdout).map((i) => ({
      id: i.id,
      cells: { nome: i.name, tamanho: i.size },
      actions: ['rmi'],
    }));
    return {
      sections: [
        {
          id: 'containers',
          title: 'Containers',
          empty: 'Nenhum container.',
          columns: [
            { key: 'nome', title: 'Nome' },
            { key: 'imagem', title: 'Imagem' },
            { key: 'portas', title: 'Portas' },
            { key: 'estado', title: 'Detalhe' },
          ],
          rows: containers,
        },
        {
          id: 'imagens',
          title: 'Imagens',
          empty: 'Nenhuma imagem.',
          columns: [
            { key: 'nome', title: 'Repositório:Tag' },
            { key: 'tamanho', title: 'Tamanho' },
          ],
          rows: imgs,
        },
      ],
    };
  }

  async function logs(containerId) {
    const { stdout, stderr } = await run(['logs', '--tail', LOG_LINES, '--timestamps', containerId]);
    return `${stdout}${stderr}`;
  }

  const simple = (verb) => (containerId) => run([verb, containerId]);

  return defineProvider({
    id,
    nome,
    detect,
    list,
    logs,
    actions: {
      start: { rotulo: 'Iniciar', destrutiva: false, run: simple('start') },
      stop: { rotulo: 'Parar', destrutiva: true, run: simple('stop') },
      restart: { rotulo: 'Reiniciar', destrutiva: false, run: simple('restart') },
      rm: { rotulo: 'Remover', destrutiva: true, run: simple('rm') },
      rmi: { rotulo: 'Remover', destrutiva: true, run: simple('rmi') },
    },
  });
}

module.exports = { createContainerEngineProvider, createFriendly, STATE_LABEL };
