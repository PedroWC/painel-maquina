'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOKEN, startTestServer, request, post, login } = require('../helpers/server');

test('RF-01: login válido devolve cookie de sessão seguro e libera /api/me', async () => {
  const srv = await startTestServer();
  try {
    const { res, cookie } = await login(srv.port);
    assert.equal(res.status, 200);
    const setCookie = res.headers['set-cookie'][0];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Max-Age=43200/);

    const me = await request({ port: srv.port, path: '/api/me', headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.deepEqual(me.json, { authenticated: true, admin: true, exposed: false });
  } finally {
    await srv.close();
  }
});

test('RF-01: token inválido responde 401 e não cria cookie', async () => {
  const srv = await startTestServer();
  try {
    const res = await post(srv.port, '/api/login', { token: 'errado' });
    assert.equal(res.status, 401);
    assert.equal(res.headers['set-cookie'], undefined);
  } finally {
    await srv.close();
  }
});

test('RN-01: após 5 falhas o servidor responde 429 mesmo com o token correto', async () => {
  const srv = await startTestServer();
  try {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await post(srv.port, '/api/login', { token: 'errado' })).status, 401);
    }
    const res = await post(srv.port, '/api/login', { token: TOKEN });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers['retry-after']) > 0);
    assert.ok(res.json.retryAfterSeconds > 0);
    assert.equal(res.headers['set-cookie'], undefined);
  } finally {
    await srv.close();
  }
});

test('RF-02: o logout invalida a sessão e limpa o cookie', async () => {
  const srv = await startTestServer();
  try {
    const { cookie } = await login(srv.port);
    const out = await post(srv.port, '/api/logout', {}, { Cookie: cookie });
    assert.equal(out.status, 200);
    assert.match(out.headers['set-cookie'][0], /Max-Age=0/);
    const me = await request({ port: srv.port, path: '/api/me', headers: { Cookie: cookie } });
    assert.equal(me.status, 401);
  } finally {
    await srv.close();
  }
});

test('RNF-01: /api/me sem cookie ou com cookie inválido responde 401', async () => {
  const srv = await startTestServer();
  try {
    assert.equal((await request({ port: srv.port, path: '/api/me' })).status, 401);
    const forged = await request({ port: srv.port, path: '/api/me', headers: { Cookie: 'sid=inventado' } });
    assert.equal(forged.status, 401);
  } finally {
    await srv.close();
  }
});

test('RN-17: login sem token, com JSON inválido ou com corpo gigante é recusado', async () => {
  const srv = await startTestServer();
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'painel' };
    assert.equal((await post(srv.port, '/api/login', {})).status, 400);
    assert.equal((await post(srv.port, '/api/login', { token: 123 })).status, 400);
    assert.equal(
      (await request({ port: srv.port, method: 'POST', path: '/api/login', headers, raw: '{ruim' })).status,
      400,
    );
    assert.equal(
      (await request({ port: srv.port, method: 'POST', path: '/api/login', headers, raw: '[1]' })).status,
      400,
    );
    const huge = JSON.stringify({ token: 'a'.repeat(200 * 1024) });
    const res = await request({ port: srv.port, method: 'POST', path: '/api/login', headers, raw: huge }).catch(
      () => ({ status: 413 }),
    );
    assert.equal(res.status, 413);
  } finally {
    await srv.close();
  }
});

test('RN-06: login e logout são auditados sem expor o token', async () => {
  const srv = await startTestServer();
  try {
    await post(srv.port, '/api/login', { token: 'errado' });
    const { cookie } = await login(srv.port);
    await post(srv.port, '/api/logout', {}, { Cookie: cookie });
    const lines = srv.readAudit().trim().split('\n').map((l) => JSON.parse(l));
    const events = lines.map((l) => `${l.action}:${l.result}`);
    assert.deepEqual(events, ['login:falha', 'login:ok', 'logout:ok']);
    const raw = srv.readAudit();
    assert.equal(raw.includes(TOKEN), false);
    assert.equal(raw.includes('sid='), false);
  } finally {
    await srv.close();
  }
});
