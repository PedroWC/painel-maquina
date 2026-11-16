'use strict';

// Gerenciador de sessões de terminal (RF-03 a RF-06, RN-07, RN-15).
// O PTY é injetável: nos testes entra uma simulação; em produção, node-pty (ConPTY).

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HttpError, badRequest, DISTRO_NAME } = require('./validate');

const SCROLLBACK_CHARS = 200 * 1024; // RN-15: cerca de 200 KB de histórico
const MIN_SIZE = 1;
const MAX_SIZE = 500;

const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');

function defaultShells() {
  return {
    powershell: {
      label: 'PowerShell',
      file: path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoLogo'],
    },
    cmd: { label: 'cmd', file: path.join(SYSTEM32, 'cmd.exe'), args: [] },
    gitbash: {
      label: 'Git Bash',
      file: path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      args: ['--login', '-i'],
    },
    wsl: { label: 'WSL', file: path.join(SYSTEM32, 'wsl.exe'), args: [] },
  };
}

function clampSize(value, fallback) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value));
}

function createTerminalManager({
  spawnPty = (...args) => require('node-pty').spawn(...args),
  maxTerminals = 20,
  shells = defaultShells(),
  isAdmin = false,
  homeDir = os.homedir(),
  exists = (file) => fs.existsSync(file),
  isDirectory = (dir) => {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  },
  now = Date.now,
  env = process.env,
} = {}) {
  const sessions = new Map();

  function availableShells() {
    return Object.entries(shells)
      .filter(([, def]) => exists(def.file))
      .map(([id, def]) => ({ id, label: def.label }));
  }

  function summary(s) {
    return {
      id: s.id,
      name: s.name,
      shell: s.shell,
      distro: s.distro,
      cwd: s.cwd,
      pid: s.pid,
      admin: s.admin,
      created: s.created,
      exited: s.exited,
      exitCode: s.exitCode,
    };
  }

  function broadcast(s, message) {
    for (const client of s.clients) {
      try {
        client.send(message);
      } catch {
        s.clients.delete(client);
      }
    }
  }

  function get(id) {
    const s = sessions.get(id);
    if (!s) throw new HttpError(404, 'Sessão de terminal não encontrada.');
    return s;
  }

  // RF-03: cria a sessão. RN-15: respeita o limite de sessões simultâneas.
  function create({ shell = 'powershell', cwd, name, cols, rows, distro } = {}) {
    const def = shells[shell];
    if (!def || !exists(def.file)) throw badRequest(`Shell indisponível: ${shell}.`);
    // RF-22: terminal em uma distribuição específica do WSL (wsl.exe -d <distro>); nome validado.
    const hasDistro = typeof distro === 'string' && distro !== '';
    if (hasDistro && shell !== 'wsl') throw badRequest('A distribuição só vale para o shell WSL.');
    if (hasDistro && !DISTRO_NAME.test(distro)) throw badRequest('distribuição inválida.');
    const args = hasDistro ? [...def.args, '-d', distro] : def.args;
    if (sessions.size >= maxTerminals) {
      throw new HttpError(409, `Limite de ${maxTerminals} sessões atingido. Encerre alguma antes de abrir outra.`);
    }

    const usable = typeof cwd === 'string' && cwd !== '' && isDirectory(cwd);
    const dir = usable ? cwd : homeDir;
    const id = crypto.randomBytes(6).toString('hex');
    const pty = spawnPty(def.file, args, {
      name: 'xterm-256color',
      cols: clampSize(cols, 120),
      rows: clampSize(rows, 30),
      cwd: dir,
      env,
    });

    const session = {
      id,
      name: name || (hasDistro ? `${def.label} ${distro}` : `${def.label} ${sessions.size + 1}`),
      shell,
      distro: hasDistro ? distro : null,
      cwd: dir,
      pid: pty.pid,
      admin: isAdmin, // RN-07: herda o privilégio do painel
      created: now(),
      exited: false,
      exitCode: null,
      buffer: '',
      clients: new Set(),
      pty,
    };

    pty.onData((data) => {
      session.buffer += data;
      if (session.buffer.length > SCROLLBACK_CHARS) {
        session.buffer = session.buffer.slice(session.buffer.length - SCROLLBACK_CHARS);
      }
      broadcast(session, { t: 'o', d: data });
    });
    pty.onExit(({ exitCode }) => {
      session.exited = true;
      session.exitCode = exitCode;
      broadcast(session, { t: 'x', c: exitCode });
    });

    sessions.set(id, session);
    return { ...summary(session), cwdFallback: !usable && cwd !== undefined && cwd !== '' };
  }

  function list() {
    return [...sessions.values()].map(summary);
  }

  // RF-05: reanexar recebendo o histórico recente; sair não encerra a sessão.
  function attach(id, client) {
    const s = get(id);
    s.clients.add(client);
    if (s.buffer) client.send({ t: 'b', d: s.buffer });
    if (s.exited) client.send({ t: 'x', c: s.exitCode });
    return () => s.clients.delete(client);
  }

  function write(id, data) {
    const s = get(id);
    if (!s.exited) s.pty.write(data);
  }

  function resize(id, cols, rows) {
    const s = get(id);
    if (!s.exited) s.pty.resize(clampSize(cols, 120), clampSize(rows, 30));
  }

  function rename(id, name) {
    get(id).name = name;
    return summary(get(id));
  }

  // RF-06: encerra o shell (se vivo) e remove a sessão da lista.
  function remove(id) {
    const s = get(id);
    if (!s.exited) {
      try {
        s.pty.kill();
      } catch {
        // o processo pode já ter terminado
      }
    }
    for (const client of s.clients) {
      try {
        client.send({ t: 'x', c: s.exitCode });
      } catch {
        // cliente já desconectado
      }
    }
    sessions.delete(id);
    return summary(s);
  }

  // RN-04: PIDs que a aba de processos não pode encerrar.
  function protectedPids() {
    return new Set([...sessions.values()].filter((s) => !s.exited).map((s) => s.pid));
  }

  function shutdown() {
    for (const id of [...sessions.keys()]) remove(id);
  }

  return { availableShells, create, list, attach, write, resize, rename, remove, protectedPids, shutdown };
}

module.exports = { createTerminalManager, defaultShells, SCROLLBACK_CHARS };
