'use strict';

// Rotas HTTP e WebSocket dos terminais (RF-03 a RF-06).

const { str, optionalStr, int, badRequest } = require('../validate');

const ID = '(?<id>[a-f0-9]{12})';
const MAX_INPUT_CHARS = 64 * 1024;

function createTerminalRoutes({ manager }) {
  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/terminals$/,
      handler: () => ({ shells: manager.availableShells(), terminals: manager.list() }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/terminals$/,
      handler: ({ body, audit, ip }) => {
        const shell = str(body.shell === undefined ? 'powershell' : body.shell, { field: 'shell', max: 20 });
        const cwd = optionalStr(body.cwd, { field: 'pasta', max: 260 });
        const name = optionalStr(body.name, { field: 'nome', max: 60 });
        const cols = body.cols === undefined ? undefined : int(body.cols, { field: 'cols', min: 1, max: 500 });
        const rows = body.rows === undefined ? undefined : int(body.rows, { field: 'rows', min: 1, max: 500 });
        const created = manager.create({ shell, cwd, name, cols, rows });
        audit.record({
          ip,
          action: 'terminal.criar',
          target: created.id,
          result: 'ok',
          detail: { shell, pid: created.pid, admin: created.admin },
        });
        return created;
      },
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/terminals/${ID}/rename$`),
      handler: ({ params, body, audit, ip }) => {
        const name = str(body.name, { field: 'nome', max: 60 });
        const renamed = manager.rename(params.id, name);
        audit.record({ ip, action: 'terminal.renomear', target: params.id, result: 'ok' });
        return renamed;
      },
    },
    {
      method: 'DELETE',
      pattern: new RegExp(`^/api/terminals/${ID}$`),
      handler: ({ params, audit, ip }) => {
        const removed = manager.remove(params.id);
        audit.record({ ip, action: 'terminal.encerrar', target: params.id, result: 'ok', detail: { pid: removed.pid } });
        return { ok: true };
      },
    },
  ];

  // WebSocket: o servidor já validou Host, Origin e sessão antes de chamar.
  const websockets = [
    {
      pattern: /^\/ws\/term$/,
      handler: (socket, { url, ip, audit }) => {
        const id = url.searchParams.get('id') || '';
        let detach;
        const client = { send: (message) => socket.send(JSON.stringify(message)) };
        try {
          detach = manager.attach(id, client);
        } catch {
          socket.close(4404, 'sessão não encontrada');
          return;
        }
        audit.record({ ip, action: 'terminal.anexar', target: id, result: 'ok' });

        socket.on('message', (raw) => {
          let message;
          try {
            message = JSON.parse(raw.toString('utf8'));
            if (message === null || typeof message !== 'object') throw badRequest('mensagem inválida');
            if (message.t === 'i') {
              if (typeof message.d !== 'string' || message.d.length > MAX_INPUT_CHARS) throw badRequest('entrada inválida');
              manager.write(id, message.d);
            } else if (message.t === 'r') {
              manager.resize(id, message.cols, message.rows);
            }
          } catch {
            // mensagens inválidas são ignoradas; nada é registrado para não vazar conteúdo
          }
        });
        socket.on('close', () => detach());
      },
    },
  ];

  return { routes, websockets };
}

module.exports = { createTerminalRoutes };
