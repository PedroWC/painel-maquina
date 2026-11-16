'use strict';

// Utilitários de teste: sobe o servidor em porta efêmera com dependências
// simuladas e oferece um cliente HTTP que permite escolher o cabeçalho Host.

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../../src/server');
const { createAuth, hashToken } = require('../../src/auth');
const { createAudit } = require('../../src/audit');
const { normalize } = require('../../src/config');

const TOKEN = 'token-de-teste-nao-secreto';
let cachedHash;

function testHash() {
  if (!cachedHash) cachedHash = hashToken(TOKEN);
  return cachedHash;
}

async function startTestServer({
  routes = [],
  websockets = [],
  configOverrides = {},
  authOptions = {},
  isAdmin = true,
  wsCheckMs = 5000,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-teste-'));
  const auditFile = path.join(dir, 'audit.log');
  const config = normalize({ tokenHash: testHash(), ...configOverrides });
  const auth = createAuth({
    tokenHash: config.tokenHash,
    sessionMs: config.sessionHours * 3600 * 1000,
    ...authOptions,
  });
  const audit = createAudit({ file: auditFile });
  const server = createServer({ config, auth, audit, routes, websockets, isAdmin, wsCheckMs });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    auditFile,
    readAudit: () => (fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : ''),
    close: () =>
      new Promise((resolve) => {
        server.closeWebSockets();
        server.closeAllConnections();
        server.close(() => {
          fs.rmSync(dir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

function request({ port, method = 'GET', path: urlPath = '/', headers = {}, body, raw }) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
          Host: `127.0.0.1:${port}`,
          ...(payload !== undefined ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// Requisição que altera estado, já com o cabeçalho exigido.
function post(port, urlPath, body, headers = {}) {
  return request({
    port,
    method: 'POST',
    path: urlPath,
    body,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'painel', ...headers },
  });
}

async function login(port) {
  const res = await post(port, '/api/login', { token: TOKEN });
  const cookie = (res.headers['set-cookie'] || [])[0] || '';
  return { res, cookie: cookie.split(';')[0] };
}

module.exports = { TOKEN, startTestServer, request, post, login };
