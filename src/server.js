'use strict';

// Servidor HTTP: borda de segurança, sessão, API e arquivos estáticos.
// As rotas das funcionalidades entram pela lista `routes` (injeção), o que
// permite testar o servidor sem tocar o sistema.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { HttpError, badRequest, str } = require('./validate');
const sec = require('./security');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY_BYTES = 64 * 1024;

// Arquivos de terceiros servidos por rotas explícitas (nada de varrer node_modules).
const VENDOR_FILES = Object.freeze({
  '/vendor/xterm.js': path.join(ROOT, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'),
  '/vendor/xterm.css': path.join(ROOT, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
  '/vendor/addon-fit.js': path.join(ROOT, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'),
});

const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Corpo da requisição grande demais.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(badRequest('O corpo deve ser um objeto JSON.'));
        }
        return resolve(parsed);
      } catch {
        return reject(badRequest('JSON inválido.'));
      }
    });
    req.on('error', () => reject(badRequest('Falha ao ler a requisição.')));
  });
}

function createServer({
  config,
  auth,
  audit,
  routes = [],
  websockets = [],
  isAdmin = false,
  staticDir = PUBLIC_DIR,
  wsCheckMs = 5000,
}) {
  const sessionSeconds = Math.round(config.sessionHours * 3600);

  async function login(ctx) {
    const body = await readJson(ctx.req);
    const token = str(body.token, { field: 'token', max: 256 });
    const result = auth.login(ctx.ip, token);
    if (result.ok) {
      audit.record({ ip: ctx.ip, action: 'login', result: 'ok' });
      ctx.res.setHeader('Set-Cookie', sec.sessionCookie(result.sid, sessionSeconds));
      return sendJson(ctx.res, 200, { ok: true });
    }
    if (result.reason === 'locked') {
      const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
      audit.record({ ip: ctx.ip, action: 'login', result: 'bloqueado' });
      ctx.res.setHeader('Retry-After', String(retryAfterSeconds));
      return sendJson(ctx.res, 429, {
        error: 'Muitas tentativas inválidas. Tente novamente mais tarde.',
        retryAfterSeconds,
      });
    }
    audit.record({ ip: ctx.ip, action: 'login', result: 'falha' });
    return sendJson(ctx.res, 401, { error: 'Token inválido.' });
  }

  async function handleApi(req, res, url, ip) {
    const method = req.method;
    res.setHeader('Cache-Control', 'no-store');

    if (method !== 'GET' && method !== 'HEAD') {
      if (!sec.originAllowed(req.headers.origin, req.headers.host)) {
        throw new HttpError(403, 'Origem não permitida.');
      }
      if (req.headers['x-requested-with'] !== 'painel') {
        throw new HttpError(403, 'Cabeçalho X-Requested-With ausente.');
      }
    }

    const ctx = { req, res, url, ip, audit, config, params: {}, body: {} };
    if (url.pathname === '/api/login' && method === 'POST') return login(ctx);

    const sid = sec.parseCookies(req.headers.cookie).sid;
    if (!sid || !auth.isValid(sid)) throw new HttpError(401, 'Não autenticado.');

    if (url.pathname === '/api/me' && method === 'GET') {
      return sendJson(res, 200, { authenticated: true, admin: isAdmin, exposed: config.exposed });
    }
    if (url.pathname === '/api/logout' && method === 'POST') {
      auth.logout(sid);
      audit.record({ ip, action: 'logout', result: 'ok' });
      res.setHeader('Set-Cookie', sec.clearedCookie());
      return sendJson(res, 200, { ok: true });
    }

    for (const route of routes) {
      if (route.method !== method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;
      ctx.params = match.groups || {};
      if (method !== 'GET') ctx.body = await readJson(req);
      let out;
      try {
        out = await route.handler(ctx);
      } catch (err) {
        // RN-03/RN-06: tentativas recusadas por proteção ou limite (409) ficam registradas.
        if (err instanceof HttpError && err.status === 409) {
          const detail = { motivo: err.message };
          for (const key of ['name', 'op', 'pid']) {
            if (ctx.body[key] !== undefined) detail[key] = ctx.body[key];
          }
          audit.record({ ip, action: 'recusado', target: `${method} ${url.pathname}`, result: 'recusado', detail });
        }
        throw err;
      }
      return sendJson(res, 200, out === undefined ? { ok: true } : out);
    }
    throw new HttpError(404, 'Rota não encontrada.');
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw badRequest('Caminho inválido.');
    }
    const name = decoded === '/' ? '/index.html' : decoded;
    let file = VENDOR_FILES[name];
    if (!file) {
      file = path.join(staticDir, name);
      if (!file.startsWith(staticDir + path.sep)) throw new HttpError(404, 'Não encontrado.');
    }
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      throw new HttpError(404, 'Não encontrado.');
    }
    if (!stat.isFile()) throw new HttpError(404, 'Não encontrado.');
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    for (const [key, value] of Object.entries(sec.SECURITY_HEADERS)) res.setHeader(key, value);
    const ip = req.socket.remoteAddress || 'desconhecido';
    try {
      if (!sec.hostAllowed(req.headers.host, config)) throw new HttpError(403, 'Host não permitido.');
      let url;
      try {
        url = new URL(req.url, 'http://localhost');
      } catch {
        throw badRequest('Endereço inválido.');
      }
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, ip);
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error('Erro interno:', err && err.message);
      return sendJson(res, 500, { error: 'Erro interno.' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  // WebSocket (RNF-01): exige Host permitido, Origin presente e coincidente e
  // sessão válida. O fluxo é derrubado quando a sessão deixa de valer.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const refuse = (status, text) => {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return refuse(400, 'Bad Request');
    }
    if (!sec.hostAllowed(req.headers.host, config)) return refuse(403, 'Forbidden');
    if (req.headers.origin === undefined || !sec.originAllowed(req.headers.origin, req.headers.host)) {
      return refuse(403, 'Forbidden');
    }
    const sid = sec.parseCookies(req.headers.cookie).sid;
    if (!sid || !auth.isValid(sid)) return refuse(401, 'Unauthorized');
    const route = websockets.find((r) => r.pattern.test(url.pathname));
    if (!route) return refuse(404, 'Not Found');

    return wss.handleUpgrade(req, socket, head, (ws) => {
      const timer = setInterval(() => {
        if (!auth.isValid(sid)) ws.terminate();
      }, wsCheckMs);
      timer.unref();
      ws.on('close', () => clearInterval(timer));
      route.handler(ws, {
        url,
        audit,
        config,
        ip: req.socket.remoteAddress || 'desconhecido',
        isSessionValid: () => auth.isValid(sid),
      });
    });
  });
  server.on('close', () => wss.close());
  server.closeWebSockets = () => wss.clients.forEach((client) => client.terminate());
  return server;
}

module.exports = { createServer, readJson, sendJson, MAX_BODY_BYTES };
