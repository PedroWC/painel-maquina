'use strict';

// Provedor pm2 (RF-19): processos gerenciados pelo pm2 (listar, iniciar, parar, reiniciar,
// excluir e logs). O pm2 instalado pelo npm é um script .cmd, que o Node recusa executar sem
// shell; por isso o provedor localiza o script de entrada (bin/pm2) e o executa com o próprio
// node, sempre com execFile e argumentos validados (ADR 0010, RN-12).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HttpError, badRequest } = require('../validate');
const { defineProvider } = require('./base');

const LOG_LINES = '300';
const NUMERIC_ID = /^\d{1,9}$/;
const GUARDED_OPS = new Set(['stop', 'restart', 'delete']);

const STATUS = {
  online: { texto: 'Online', tom: 'ok' },
  stopped: { texto: 'Parado', tom: 'off' },
  stopping: { texto: 'Parando', tom: 'off' },
  launching: { texto: 'Iniciando', tom: 'off' },
  errored: { texto: 'Com erro', tom: 'mau' },
  'one-launch-status': { texto: 'Executado', tom: 'off' },
};

const entryOf = (dir) => path.join(dir, 'node_modules', 'pm2', 'bin', 'pm2');
const isPm2Entry = (file) => typeof file === 'string' && path.basename(file) === 'pm2';

function pm2Home(env = process.env) {
  return env.PM2_HOME || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.pm2');
}

// O daemon só existe se o pm2 já foi usado: detectar e listar não devem iniciá-lo como efeito colateral.
function defaultDaemonRunning(env = process.env) {
  try {
    const pid = Number(fs.readFileSync(path.join(pm2Home(env), 'pm2.pid'), 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err) && err.code === 'EPERM'; // existe, mas é de outro nível de privilégio
  }
}

// Procura bin/pm2: configuração, variável de ambiente, `where` e pastas usuais de instalação global.
function createPm2Locator({ cli, configured = '', exists = fs.existsSync, env = process.env, nodeDir = path.dirname(process.execPath) }) {
  return async function locate() {
    for (const given of [configured, env.PAINEL_PM2_ENTRY]) {
      if (given && isPm2Entry(given) && exists(given)) return given;
    }
    try {
      const { stdout } = await cli.run('where.exe', ['pm2.cmd'], { timeoutMs: 5000 });
      for (const line of stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
        const candidate = entryOf(path.dirname(line));
        if (exists(candidate)) return candidate;
      }
    } catch {
      // `where` não achou: segue para as pastas usuais
    }
    const dirs = [
      nodeDir, // prefixo global quando o Node foi instalado em pasta própria (por exemplo, via WinGet)
      env.APPDATA && path.join(env.APPDATA, 'npm'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'npm'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'nodejs'),
    ].filter(Boolean);
    for (const dir of dirs) {
      if (exists(entryOf(dir))) return entryOf(dir);
    }
    return null;
  };
}

const MAX_JSON_CANDIDATES = 20;

// O pm2 pode imprimir mensagens como "[PM2] Spawning PM2 daemon" antes do JSON; o primeiro "["
// da saída nem sempre é o início da lista. Tenta cada "[" até achar um JSON válido.
function parseJlist(stdout) {
  let from = stdout.indexOf('[');
  if (from === -1) return [];
  for (let attempts = 0; from !== -1 && attempts < MAX_JSON_CANDIDATES; attempts += 1) {
    try {
      const parsed = JSON.parse(stdout.slice(from));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // não é o início do JSON; tenta o próximo "["
    }
    from = stdout.indexOf('[', from + 1);
  }
  throw new HttpError(502, 'Resposta inesperada do pm2.');
}

function humanDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function createPm2Provider({
  cli,
  locate,
  daemonRunning = () => defaultDaemonRunning(),
  isProtectedPid = () => false,
  now = Date.now,
  nodeExecutable = process.execPath,
}) {
  let entry = null;

  async function ensureEntry() {
    if (!entry) entry = await locate();
    if (!entry) throw new HttpError(404, 'pm2 não está instalado ou não foi encontrado.');
    return entry;
  }

  async function pm2(args, options) {
    const script = await ensureEntry();
    try {
      return await cli.run(nodeExecutable, [script, ...args], options);
    } catch (err) {
      entry = null; // se o script sumiu (pm2 desinstalado), localiza de novo na próxima chamada
      throw err;
    }
  }

  async function readProcesses() {
    const { stdout } = await pm2(['jlist']);
    return parseJlist(stdout);
  }

  async function detect() {
    entry = await locate();
    if (!entry) return { disponivel: false };
    const { stdout } = await pm2(['--version']);
    const version = stdout.trim().split(/\r?\n/).pop();
    return { disponivel: true, versao: version, info: { daemon: Boolean(await daemonRunning()) } };
  }

  function row(p) {
    const env = p.pm2_env || {};
    const monit = p.monit || {};
    const status = STATUS[env.status] || { texto: String(env.status || '—'), tom: 'off' };
    const protectedProcess = Boolean(p.pid) && isProtectedPid(p.pid);
    const uptime = env.status === 'online' && env.pm_uptime ? humanDuration(Math.max(0, Math.floor((now() - env.pm_uptime) / 1000))) : '—';
    let actions;
    if (protectedProcess) actions = []; // RN-04: o próprio painel não é gerenciado por aqui
    else if (env.status === 'online') actions = ['restart', 'stop', 'delete'];
    else if (env.status === 'launching' || env.status === 'stopping') actions = ['stop'];
    else actions = ['start', 'delete'];
    return {
      id: String(p.pm_id),
      cells: {
        nome: protectedProcess ? `${p.name} (painel)` : p.name,
        id: String(p.pm_id),
        modo: String(env.exec_mode || '—').replace('_mode', ''),
        cpu: `${monit.cpu ?? 0}%`,
        mem: `${Math.round((monit.memory || 0) / 1048576)} MB`,
        restarts: env.restart_time ?? 0,
        uptime,
        pid: p.pid || '—',
      },
      status,
      actions,
      logs: true,
    };
  }

  async function list() {
    await ensureEntry();
    const columns = [
      { key: 'nome', title: 'Nome' },
      { key: 'id', title: 'ID' },
      { key: 'modo', title: 'Modo' },
      { key: 'cpu', title: 'CPU' },
      { key: 'mem', title: 'Memória' },
      { key: 'restarts', title: 'Reinícios' },
      { key: 'uptime', title: 'Tempo ativo' },
      { key: 'pid', title: 'PID' },
    ];
    if (!(await daemonRunning())) {
      return {
        contexto: 'O daemon do pm2 não está em execução, então não há processos gerenciados no momento.',
        sections: [{ id: 'processos', title: 'Processos', empty: 'Nenhum processo.', columns, rows: [] }],
      };
    }
    const processes = await readProcesses();
    return {
      sections: [{ id: 'processos', title: 'Processos', empty: 'Nenhum processo.', columns, rows: processes.map(row) }],
    };
  }

  // RN-04: não permite parar, reiniciar ou excluir o processo que é o próprio painel.
  async function guard(id, op) {
    if (!GUARDED_OPS.has(op) || !(await daemonRunning())) return;
    const target = (await readProcesses()).find((p) => String(p.pm_id) === id);
    if (target && target.pid && isProtectedPid(target.pid)) {
      throw new HttpError(409, 'Processo protegido: é o próprio painel ou um de seus terminais.');
    }
  }

  const act = (op) => async (id) => {
    await guard(id, op);
    return pm2([op, id]);
  };

  async function logs(id) {
    const { stdout, stderr } = await pm2(['logs', id, '--lines', LOG_LINES, '--nostream', '--no-color']);
    return `${stdout}${stderr}`;
  }

  function validateId(value) {
    if (typeof value !== 'string' || !NUMERIC_ID.test(value)) throw badRequest('identificador inválido.');
    return value;
  }

  return defineProvider({
    id: 'pm2',
    nome: 'pm2',
    detect,
    list,
    logs,
    validateId,
    actions: {
      start: { rotulo: 'Iniciar', destrutiva: false, run: act('start') },
      restart: { rotulo: 'Reiniciar', destrutiva: false, run: act('restart') },
      stop: { rotulo: 'Parar', destrutiva: true, run: act('stop') },
      delete: { rotulo: 'Excluir', destrutiva: true, run: act('delete') },
    },
  });
}

module.exports = { createPm2Provider, createPm2Locator, defaultDaemonRunning, humanDuration, parseJlist, pm2Home };
