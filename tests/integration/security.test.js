'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOKEN, startTestServer, request, post, login } = require('../helpers/server');

test('RNF-01: Host desconhecido é recusado com 403 (DNS rebinding)', async () => {
  const srv = await startTestServer();
  try {
    const res = await request({ port: srv.port, path: '/', headers: { Host: 'evil.example' } });
    assert.equal(res.status, 403);
    const api = await request({ port: srv.port, path: '/api/me', headers: { Host: 'evil.example' } });
    assert.equal(api.status, 403);
  } finally {
    await srv.close();
  }
});

test('RNF-01: Host de allowedHosts é aceito quando configurado', async () => {
  const srv = await startTestServer({ configOverrides: { allowedHosts: ['painel.exemplo'] } });
  try {
    const res = await request({ port: srv.port, path: '/', headers: { Host: 'painel.exemplo' } });
    assert.equal(res.status, 200);
  } finally {
    await srv.close();
  }
});

test('RNF-01: POST com Origin de outro site é recusado com 403 (CSRF)', async () => {
  const srv = await startTestServer();
  try {
    const res = await post(srv.port, '/api/login', { token: TOKEN }, { Origin: 'http://evil.example' });
    assert.equal(res.status, 403);
    assert.equal(res.headers['set-cookie'], undefined);
  } finally {
    await srv.close();
  }
});

test('RNF-01: POST com Origin igual ao Host é aceito', async () => {
  const srv = await startTestServer();
  try {
    const res = await post(srv.port, '/api/login', { token: TOKEN }, { Origin: `http://127.0.0.1:${srv.port}` });
    assert.equal(res.status, 200);
  } finally {
    await srv.close();
  }
});

test('RNF-01: POST sem X-Requested-With é recusado com 403', async () => {
  const srv = await startTestServer();
  try {
    const res = await request({
      port: srv.port,
      method: 'POST',
      path: '/api/login',
      headers: { 'Content-Type': 'application/json' },
      body: { token: TOKEN },
    });
    assert.equal(res.status, 403);
  } finally {
    await srv.close();
  }
});

test('RNF-01: cabeçalhos de segurança aparecem em páginas e na API', async () => {
  const srv = await startTestServer();
  try {
    for (const path of ['/', '/api/me']) {
      const res = await request({ port: srv.port, path });
      assert.match(res.headers['content-security-policy'], /default-src 'self'/);
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['referrer-policy'], 'no-referrer');
    }
    const api = await request({ port: srv.port, path: '/api/me' });
    assert.equal(api.headers['cache-control'], 'no-store');
  } finally {
    await srv.close();
  }
});

test('RNF-01: arquivos fora de public/ não são servidos (path traversal)', async () => {
  const srv = await startTestServer();
  try {
    for (const path of ['/package.json', '/%2e%2e/package.json', '/..%2f..%2fconfig.json', '/src/server.js', '/%00']) {
      const res = await request({ port: srv.port, path });
      assert.ok([400, 404].includes(res.status), `${path} -> ${res.status}`);
    }
  } finally {
    await srv.close();
  }
});

test('RNF-01: a página inicial e o JavaScript da interface são servidos', async () => {
  const srv = await startTestServer();
  try {
    const home = await request({ port: srv.port, path: '/' });
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html/);
    assert.doesNotMatch(home.text, /<script>[^<]/); // sem script inline (CSP)
    const js = await request({ port: srv.port, path: '/app.js' });
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
  } finally {
    await srv.close();
  }
});

test('RNF-01: métodos não permitidos em arquivos estáticos retornam 405', async () => {
  const srv = await startTestServer();
  try {
    const res = await request({ port: srv.port, method: 'DELETE', path: '/app.js' });
    assert.equal(res.status, 405);
  } finally {
    await srv.close();
  }
});

test('RNF-01: rotas inexistentes exigem sessão (401) e depois respondem 404', async () => {
  const srv = await startTestServer();
  try {
    assert.equal((await request({ port: srv.port, path: '/api/nao-existe' })).status, 401);
    const { cookie } = await login(srv.port);
    assert.equal((await request({ port: srv.port, path: '/api/nao-existe', headers: { Cookie: cookie } })).status, 404);
  } finally {
    await srv.close();
  }
});

test('RNF-01: rotas registradas exigem sessão e erros internos não vazam detalhes', async () => {
  const routes = [
    { method: 'GET', pattern: /^\/api\/teste$/, handler: () => ({ valor: 1 }) },
    {
      method: 'POST',
      pattern: /^\/api\/quebra$/,
      handler: () => {
        throw new Error('detalhe-interno-secreto');
      },
    },
  ];
  const srv = await startTestServer({ routes });
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal((await request({ port: srv.port, path: '/api/teste' })).status, 401);
    const { cookie } = await login(srv.port);
    const ok = await request({ port: srv.port, path: '/api/teste', headers: { Cookie: cookie } });
    assert.deepEqual(ok.json, { valor: 1 });
    const broken = await post(srv.port, '/api/quebra', {}, { Cookie: cookie });
    assert.equal(broken.status, 500);
    assert.equal(broken.text.includes('detalhe-interno-secreto'), false);
  } finally {
    console.error = original;
    await srv.close();
  }
});
