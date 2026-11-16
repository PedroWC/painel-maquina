'use strict';

// Provedor Docker (RF-15, RF-16): containers e imagens pela CLI `docker`.
// Só opera com execFile e argumentos validados (ADR 0010, RN-12).

const { HttpError } = require('../validate');
const { defineProvider } = require('./base');

const EXECUTABLE = 'docker';
const LOG_LINES = '300';

const ENGINE_DOWN = /failed to connect to the docker api|cannot connect to the docker daemon|docker_engine|error during connect/i;

// UC-10 (exceção A): motor parado vira uma mensagem amigável, sem o erro técnico bruto.
function friendly(err) {
  if (err instanceof HttpError && err.status === 502 && ENGINE_DOWN.test(err.message)) {
    return new HttpError(503, 'O Docker está instalado, mas o motor não está respondendo. Inicie o Docker Desktop e tente novamente.');
  }
  return err;
}

function parseLines(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function stateTone(state) {
  if (state === 'running') return 'ok';
  if (state === 'restarting' || state === 'paused') return 'off';
  return 'off';
}

const STATE_LABEL = {
  running: 'Em execução',
  exited: 'Parado',
  created: 'Criado',
  paused: 'Pausado',
  restarting: 'Reiniciando',
  dead: 'Inválido',
};

function createDockerProvider({ cli }) {
  async function docker(args, options) {
    try {
      return await cli.run(EXECUTABLE, args, options);
    } catch (err) {
      throw friendly(err);
    }
  }

  async function detect() {
    let version;
    try {
      const { stdout } = await cli.run(EXECUTABLE, ['--version']);
      version = (stdout.match(/Docker version ([^,\s]+)/) || [])[1] || stdout.trim();
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { disponivel: false };
      throw err;
    }
    let motor = false;
    try {
      await cli.run(EXECUTABLE, ['info', '--format', '{{.ServerVersion}}'], { timeoutMs: 8000 });
      motor = true;
    } catch {
      motor = false;
    }
    return { disponivel: true, versao: version, info: { motor } };
  }

  async function list() {
    const [ps, images] = await Promise.all([
      docker(['ps', '-a', '--format', '{{json .}}']),
      docker(['images', '--format', '{{json .}}']),
    ]);
    const containers = parseLines(ps.stdout).map((c) => {
      const running = c.State === 'running';
      return {
        id: c.ID,
        cells: { nome: c.Names, imagem: c.Image, portas: c.Ports || '—', estado: c.Status },
        status: { texto: STATE_LABEL[c.State] || c.State, tom: stateTone(c.State) },
        actions: running ? ['stop', 'restart'] : ['start', 'rm'],
        logs: true,
      };
    });
    const imgs = parseLines(images.stdout).map((i) => ({
      id: i.ID,
      cells: { nome: `${i.Repository}:${i.Tag}`, tamanho: i.Size },
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

  async function logs(id) {
    const { stdout, stderr } = await docker(['logs', '--tail', LOG_LINES, '--timestamps', id]);
    return `${stdout}${stderr}`;
  }

  const simple = (verb) => (id) => docker([verb, id]);

  return defineProvider({
    id: 'docker',
    nome: 'Docker',
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

module.exports = { createDockerProvider, friendly };
