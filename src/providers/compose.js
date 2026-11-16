'use strict';

// Provedor Docker Compose (RF-18): projetos e serviços pelo plugin `docker compose` (v2).
// Subir, parar e reiniciar um projeto e ver logs do projeto ou de um serviço.
//
// Segurança (ADR 0010, RN-12):
//   - o cliente só informa o NOME do projeto (e do serviço); os arquivos do projeto vêm da própria
//     listagem do Compose e são conferidos como caminhos absolutos;
//   - `up` usa --no-build: nunca executa builds por esta interface (apenas inicia o que já existe
//     ou baixa imagens prontas);
//   - não há `down`: nada aqui remove containers, redes ou volumes.

const { HttpError, badRequest } = require('../validate');
const { defineProvider } = require('./base');
const { friendly } = require('./docker');

const EXECUTABLE = 'docker';
const LOG_LINES = '300';
const MAX_PROJECTS = 30;
const UP_TIMEOUT_MS = 120000;

const PROJECT = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const SERVICE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
const ABSOLUTE_PATH = /^([A-Za-z]:[\\/]|\/)/;

// "meu-projeto" ou "meu-projeto/servico".
function parseId(id) {
  const [project, service, extra] = typeof id === 'string' ? id.split('/') : [];
  if (extra !== undefined || !PROJECT.test(project || '') || (service !== undefined && !SERVICE.test(service))) {
    throw badRequest('identificador inválido.');
  }
  return { project, service };
}

// `compose ps --format json` imprime uma lista (versões antigas) ou um objeto por linha (novas).
function parseJson(stdout) {
  const text = stdout.trim();
  if (text === '') return [];
  try {
    const whole = JSON.parse(text);
    return Array.isArray(whole) ? whole : [whole];
  } catch {
    try {
      return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      throw new HttpError(502, 'Resposta inesperada do docker compose.');
    }
  }
}

function runningCount(status) {
  const match = /running\((\d+)\)/i.exec(String(status || ''));
  return match ? Number(match[1]) : 0;
}

function formatPublishers(publishers) {
  if (!Array.isArray(publishers)) return '';
  return publishers
    .filter((p) => p.PublishedPort)
    .map((p) => `${p.URL || '0.0.0.0'}:${p.PublishedPort}->${p.TargetPort}/${p.Protocol || 'tcp'}`)
    .join(', ');
}

function createComposeProvider({ cli }) {
  async function compose(args, options) {
    try {
      return await cli.run(EXECUTABLE, ['compose', ...args], options);
    } catch (err) {
      throw friendly(err);
    }
  }

  async function detect() {
    try {
      const { stdout } = await cli.run(EXECUTABLE, ['compose', 'version', '--short']);
      return { disponivel: true, versao: stdout.trim().replace(/^v/, '') || 'desconhecida' };
    } catch (err) {
      // 404: sem docker; 502: docker sem o plugin ("unknown command: docker compose").
      if (err instanceof HttpError && (err.status === 404 || err.status === 502)) return { disponivel: false };
      throw err;
    }
  }

  async function projects() {
    const { stdout } = await compose(['ls', '--all', '--format', 'json']);
    return parseJson(stdout).slice(0, MAX_PROJECTS);
  }

  async function services(project) {
    try {
      const { stdout } = await compose(['-p', project, 'ps', '--all', '--format', 'json']);
      return parseJson(stdout);
    } catch (err) {
      if (err instanceof HttpError && err.status === 503) throw err; // motor parado: não esconder
      return []; // projeto sem containers ou removido no meio da consulta
    }
  }

  async function list() {
    const found = (await projects()).filter((p) => PROJECT.test(p.Name || ''));
    const perProject = await Promise.all(found.map((p) => services(p.Name)));

    const projectRows = found.map((p) => {
      const up = runningCount(p.Status);
      return {
        id: p.Name,
        cells: { nome: p.Name, estado: p.Status || '—', arquivo: String(p.ConfigFiles || '—').split(',')[0] },
        status: up > 0 ? { texto: `${up} em execução`, tom: 'ok' } : { texto: 'Parado', tom: 'off' },
        actions: up > 0 ? ['up', 'restart', 'stop'] : ['up'],
        logs: true,
      };
    });

    const serviceRows = [];
    found.forEach((p, i) => {
      for (const s of perProject[i]) {
        if (!SERVICE.test(s.Service || '')) continue;
        serviceRows.push({
          id: `${p.Name}/${s.Service}`,
          cells: { projeto: p.Name, servico: s.Service, imagem: s.Image || '—', portas: formatPublishers(s.Publishers) || '—', estado: s.Status || s.State || '—' },
          status: s.State === 'running' ? { texto: 'Em execução', tom: 'ok' } : { texto: s.State === 'exited' ? 'Parado' : String(s.State || '—'), tom: 'off' },
          actions: [],
          logs: true,
        });
      }
    });

    return {
      sections: [
        {
          id: 'projetos',
          title: 'Projetos',
          empty: 'Nenhum projeto do Compose.',
          columns: [
            { key: 'nome', title: 'Projeto' },
            { key: 'estado', title: 'Detalhe' },
            { key: 'arquivo', title: 'Arquivo' },
          ],
          rows: projectRows,
        },
        {
          id: 'servicos',
          title: 'Serviços',
          empty: 'Nenhum serviço.',
          columns: [
            { key: 'projeto', title: 'Projeto' },
            { key: 'servico', title: 'Serviço' },
            { key: 'imagem', title: 'Imagem' },
            { key: 'portas', title: 'Portas' },
            { key: 'estado', title: 'Detalhe' },
          ],
          rows: serviceRows,
        },
      ],
    };
  }

  // Os arquivos vêm da listagem do Compose (nunca do cliente) e precisam ser caminhos absolutos.
  async function configFilesOf(project) {
    const entry = (await projects()).find((p) => p.Name === project);
    if (!entry) throw new HttpError(404, 'Projeto do Compose não encontrado.');
    const files = String(entry.ConfigFiles || '').split(',').map((f) => f.trim()).filter(Boolean);
    if (files.length === 0 || !files.every((f) => ABSOLUTE_PATH.test(f))) {
      throw new HttpError(409, 'Não foi possível localizar os arquivos deste projeto. Suba-o pela linha de comando.');
    }
    return files;
  }

  const projectOnly = (id) => {
    const { project, service } = parseId(id);
    if (service !== undefined) throw badRequest('Esta operação vale para o projeto inteiro.');
    return project;
  };

  async function logs(id) {
    const { project, service } = parseId(id);
    const { stdout, stderr } = await compose(['-p', project, 'logs', '--tail', LOG_LINES, '--timestamps', '--no-color', ...(service ? [service] : [])]);
    return `${stdout}${stderr}`;
  }

  return defineProvider({
    id: 'compose',
    nome: 'Docker Compose',
    timeoutMs: UP_TIMEOUT_MS + 10000,
    detect,
    list,
    logs,
    validateId(id) {
      parseId(id);
      return id;
    },
    actions: {
      up: {
        rotulo: 'Subir',
        destrutiva: false,
        run: async (id) => {
          const project = projectOnly(id);
          const files = await configFilesOf(project);
          return compose(['-p', project, ...files.map((f) => `--file=${f}`), 'up', '-d', '--no-build'], { timeoutMs: UP_TIMEOUT_MS });
        },
      },
      restart: { rotulo: 'Reiniciar', destrutiva: false, run: async (id) => compose(['-p', projectOnly(id), 'restart']) },
      stop: { rotulo: 'Parar', destrutiva: true, run: async (id) => compose(['-p', projectOnly(id), 'stop']) },
    },
  });
}

module.exports = { createComposeProvider, parseId, parseJson, runningCount };
