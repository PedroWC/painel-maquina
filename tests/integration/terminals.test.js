'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startTestServer, request, post, login } = require('../helpers/server');
const { createFakeSpawn } = require('../helpers/fake-pty');
const { createTerminalManager } = require('../../src/terminals');
const { createTerminalRoutes } = require('../../src/routes/terminals');

async function setup(options = {}) {
  const fake = createFakeSpawn();
  const manager = createTerminalManager({
    spawnPty: fake.spawn,
    exists: () => true,
    isDirectory: () => true,
    isAdmin: true,
    ...options.manager,
  });
  const { routes, websockets } = createTerminalRoutes({ manager });
  const srv = await startTestServer({ routes, websockets, wsCheckMs: 40 });
  const { cookie } = await login(srv.port);
  const auth = { Cookie: cookie };
  return { srv, fake, manager, cookie, auth };
}

function connect(port, id, headers) {
  const messages = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/term?id=${id}`, { headers });
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString('utf8'))));
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
  const waitFor = async (predicate, ms = 2000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('mensagem esperada não chegou');
  };
  return { ws, messages, opened, closed, waitFor };
}

function refusedStatus(port, id, headers, hostHeader) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/term?id=${id}`, {
      headers: hostHeader ? { ...headers, Host: hostHeader } : headers,
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('error', () => {});
  });
}

test('RF-03 e RF-04: cria, lista e mostra o privilégio da sessão', async () => {
  const { srv, auth } = await setup();
  try {
    const empty = await request({ port: srv.port, path: '/api/terminals', headers: auth });
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.json.terminals, []);
    assert.ok(empty.json.shells.some((s) => s.id === 'powershell'));

    const created = await post(srv.port, '/api/terminals', { shell: 'powershell', name: 'manutenção' }, auth);
    assert.equal(created.status, 200);
    assert.equal(created.json.admin, true);
    assert.equal(created.json.name, 'manutenção');

    const list = await request({ port: srv.port, path: '/api/terminals', headers: auth });
    assert.equal(list.json.terminals.length, 1);
    assert.equal(list.json.terminals[0].id, created.json.id);
  } finally {
    await srv.close();
  }
});

test('RNF-01: todas as rotas de terminal exigem sessão e o cabeçalho X-Requested-With', async () => {
  const { srv, auth } = await setup();
  try {
    const created = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    const base = `/api/terminals/${created.id}`;
    const calls = [
      { method: 'GET', path: '/api/terminals' },
      { method: 'POST', path: '/api/terminals', body: { shell: 'cmd' } },
      { method: 'POST', path: `${base}/rename`, body: { name: 'x' } },
      { method: 'DELETE', path: base },
    ];
    for (const call of calls) {
      const noSession = await request({
        port: srv.port,
        ...call,
        headers: { 'X-Requested-With': 'painel', 'Content-Type': 'application/json' },
      });
      assert.equal(noSession.status, 401, `${call.method} ${call.path} sem sessão`);
      if (call.method !== 'GET') {
        const noHeader = await request({ port: srv.port, ...call, headers: { ...auth, 'Content-Type': 'application/json' } });
        assert.equal(noHeader.status, 403, `${call.method} ${call.path} sem X-Requested-With`);
      }
    }
  } finally {
    await srv.close();
  }
});

test('RN-17: entradas inválidas na criação e renomeação respondem 400', async () => {
  const { srv, auth } = await setup();
  try {
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'zsh' }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 5 }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', name: 'x'.repeat(61) }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', name: 'a\nb' }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', cols: 'larga' }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', rows: 0 }, auth)).status, 400);
    const ok = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    assert.equal((await post(srv.port, `/api/terminals/${ok.id}/rename`, {}, auth)).status, 400);
    assert.equal((await post(srv.port, `/api/terminals/${ok.id}/rename`, { name: '' }, auth)).status, 400);
  } finally {
    await srv.close();
  }
});

test('RF-06: renomear e encerrar funcionam; ids inexistentes ou malformados dão 404', async () => {
  const { srv, fake, auth } = await setup();
  try {
    const { id } = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    const renamed = await post(srv.port, `/api/terminals/${id}/rename`, { name: 'novo nome' }, auth);
    assert.equal(renamed.json.name, 'novo nome');

    const gone = await request({
      port: srv.port,
      method: 'DELETE',
      path: `/api/terminals/${id}`,
      headers: { ...auth, 'X-Requested-With': 'painel' },
    });
    assert.equal(gone.status, 200);
    assert.equal(fake.spawned[0].killed, true);

    const again = await request({
      port: srv.port,
      method: 'DELETE',
      path: `/api/terminals/${id}`,
      headers: { ...auth, 'X-Requested-With': 'painel' },
    });
    assert.equal(again.status, 404);
    assert.equal((await post(srv.port, '/api/terminals/zzz/rename', { name: 'x' }, auth)).status, 404);
  } finally {
    await srv.close();
  }
});

test('RN-15: ao atingir o limite a criação responde 409', async () => {
  const { srv, auth } = await setup({ manager: { maxTerminals: 1 } });
  try {
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).status, 200);
    const res = await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth);
    assert.equal(res.status, 409);
    assert.match(res.json.error, /Limite/);
  } finally {
    await srv.close();
  }
});

test('RF-05: o WebSocket entrega histórico, saída ao vivo e repassa entrada e redimensionamento', async () => {
  const { srv, fake, auth, cookie } = await setup();
  try {
    const { id } = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    fake.spawned[0].emit('bem-vindo\r\n');
    const origin = `http://127.0.0.1:${srv.port}`;
    const client = connect(srv.port, id, { Cookie: cookie, Origin: origin });
    await client.opened;

    const replay = await client.waitFor((m) => m.t === 'b');
    assert.equal(replay.d, 'bem-vindo\r\n');

    client.ws.send(JSON.stringify({ t: 'i', d: 'dir\r' }));
    const echoed = await client.waitFor((m) => m.t === 'o' && m.d === 'eco:dir\r');
    assert.ok(echoed);
    assert.deepEqual(fake.spawned[0].written, ['dir\r']);

    client.ws.send(JSON.stringify({ t: 'r', cols: 100, rows: 40 }));
    for (let i = 0; i < 50 && fake.spawned[0].resized.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.deepEqual(fake.spawned[0].resized, [[100, 40]]);
    client.ws.close();
    await client.closed;

    // a sessão continua viva depois que o cliente sai
    assert.equal(fake.spawned[0].killed, false);
    const again = connect(srv.port, id, { Cookie: cookie, Origin: origin });
    await again.opened;
    const second = await again.waitFor((m) => m.t === 'b');
    assert.ok(second.d.includes('bem-vindo') && second.d.includes('eco:dir'));
    again.ws.close();
  } finally {
    await srv.close();
  }
});

test('RNF-01: mensagens inválidas no WebSocket são ignoradas e a conexão continua', async () => {
  const { srv, fake, auth, cookie } = await setup();
  try {
    const { id } = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    const client = connect(srv.port, id, { Cookie: cookie, Origin: `http://127.0.0.1:${srv.port}` });
    await client.opened;
    client.ws.send('isto não é json');
    client.ws.send('null');
    client.ws.send(JSON.stringify({ t: 'i', d: 123 }));
    client.ws.send(JSON.stringify({ t: 'i', d: 'x'.repeat(70 * 1024) }));
    client.ws.send(JSON.stringify({ t: 'desconhecido' }));
    client.ws.send(JSON.stringify({ t: 'i', d: 'ok' }));
    await client.waitFor((m) => m.t === 'o' && m.d === 'eco:ok');
    assert.deepEqual(fake.spawned[0].written, ['ok']);
    client.ws.close();
  } finally {
    await srv.close();
  }
});

test('RNF-01: WebSocket recusa sem sessão (401), Origin ausente ou errado e Host falso (403)', async () => {
  const { srv, auth, cookie } = await setup();
  try {
    const { id } = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    const origin = `http://127.0.0.1:${srv.port}`;
    assert.equal(await refusedStatus(srv.port, id, { Origin: origin }), 401);
    assert.equal(await refusedStatus(srv.port, id, { Cookie: 'sid=falso', Origin: origin }), 401);
    assert.equal(await refusedStatus(srv.port, id, { Cookie: cookie }), 403);
    assert.equal(await refusedStatus(srv.port, id, { Cookie: cookie, Origin: 'http://evil.example' }), 403);
    assert.equal(await refusedStatus(srv.port, id, { Cookie: cookie, Origin: origin }, 'evil.example'), 403);
  } finally {
    await srv.close();
  }
});

test('RF-05: sessão inexistente fecha o WebSocket com código 4404', async () => {
  const { srv, cookie } = await setup();
  try {
    const client = connect(srv.port, 'aaaaaaaaaaaa', { Cookie: cookie, Origin: `http://127.0.0.1:${srv.port}` });
    await client.opened;
    assert.equal(await client.closed, 4404);
  } finally {
    await srv.close();
  }
});

test('RF-02: o logout derruba os WebSockets abertos', async () => {
  const { srv, auth, cookie } = await setup();
  try {
    const { id } = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    const client = connect(srv.port, id, { Cookie: cookie, Origin: `http://127.0.0.1:${srv.port}` });
    await client.opened;
    await post(srv.port, '/api/logout', {}, auth);
    await Promise.race([
      client.closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('o WebSocket não foi derrubado')), 3000)),
    ]);
  } finally {
    await srv.close();
  }
});

test('RN-06: criar, anexar, renomear e encerrar são auditados sem o texto digitado', async () => {
  const { srv, auth, cookie } = await setup();
  try {
    const { id } = (await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth)).json;
    const client = connect(srv.port, id, { Cookie: cookie, Origin: `http://127.0.0.1:${srv.port}` });
    await client.opened;
    client.ws.send(JSON.stringify({ t: 'i', d: 'comando-secreto-123\r' }));
    await client.waitFor((m) => m.t === 'o');
    client.ws.close();
    await client.closed;
    await post(srv.port, `/api/terminals/${id}/rename`, { name: 'x' }, auth);
    await request({ port: srv.port, method: 'DELETE', path: `/api/terminals/${id}`, headers: { ...auth, 'X-Requested-With': 'painel' } });

    const audit = srv.readAudit();
    const actions = audit.trim().split('\n').map((l) => JSON.parse(l).action).filter((a) => a.startsWith('terminal.'));
    assert.deepEqual(actions, ['terminal.criar', 'terminal.anexar', 'terminal.renomear', 'terminal.encerrar']);
    assert.equal(audit.includes('comando-secreto-123'), false);
  } finally {
    await srv.close();
  }
});

test('RF-22: a API abre terminal WSL em uma distribuição e audita a distribuição', async () => {
  const { srv, fake, auth } = await setup();
  try {
    const res = await post(srv.port, '/api/terminals', { shell: 'wsl', distro: 'Ubuntu' }, auth);
    assert.equal(res.status, 200);
    assert.equal(res.json.distro, 'Ubuntu');
    assert.deepEqual(fake.spawned[0].args, ['-d', 'Ubuntu']);
    assert.match(srv.readAudit(), /"distro":"Ubuntu"/);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', distro: 'Ubuntu' }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'wsl', distro: '--exec calc' }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'wsl', distro: 5 }, auth)).status, 400);
    assert.equal(fake.spawned.length, 1);
  } finally {
    await srv.close();
  }
});

test('RN-18: a API abre terminal sem administrador, informa o privilégio do painel e audita a escolha', async () => {
  const lowered = [];
  const { srv, fake, auth } = await setup({
    manager: { launchLowPrivilege: (o) => { lowered.push(o); return { file: 'lancador.exe', args: [], env: {} }; } },
  });
  try {
    const list = await request({ port: srv.port, path: '/api/terminals', headers: auth });
    assert.equal(list.json.panelAdmin, true);

    const low = await post(srv.port, '/api/terminals', { shell: 'cmd', admin: false }, auth);
    assert.equal(low.status, 200);
    assert.equal(low.json.admin, false);
    assert.equal(fake.spawned[0].file, 'lancador.exe');
    const high = await post(srv.port, '/api/terminals', { shell: 'cmd', admin: true }, auth);
    assert.equal(high.json.admin, true);
    const standard = await post(srv.port, '/api/terminals', { shell: 'cmd' }, auth);
    assert.equal(standard.json.admin, true);
    assert.equal(lowered.length, 1);

    const audit = srv.readAudit();
    assert.match(audit, /"admin":false/);
    assert.match(audit, /"admin":true/);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', admin: 'false' }, auth)).status, 400);
  } finally {
    await srv.close();
  }
});

test('RN-18: com painel sem elevação a API não oferece administrador e recusa o pedido', async () => {
  const { srv, auth } = await setup({ manager: { isAdmin: false } });
  try {
    const list = await request({ port: srv.port, path: '/api/terminals', headers: auth });
    assert.equal(list.json.panelAdmin, false);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', admin: true }, auth)).status, 400);
    assert.equal((await post(srv.port, '/api/terminals', { shell: 'cmd', admin: false }, auth)).json.admin, false);
  } finally {
    await srv.close();
  }
});
