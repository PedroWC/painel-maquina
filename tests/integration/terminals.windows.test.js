'use strict';

// Teste de sistema (windows): abre um terminal real (ConPTY) e confere que o
// shell executa comandos e que encerrar a sessão mata o processo.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerminalManager } = require('../../src/terminals');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('RF-03: terminal real executa comandos e é encerrado de verdade', { skip: process.platform !== 'win32' }, async () => {
  const manager = createTerminalManager({ isAdmin: false });
  let pid;
  try {
    const created = manager.create({ shell: 'cmd', name: 'PainelTeste_terminal' });
    pid = created.pid;
    const received = [];
    manager.attach(created.id, { send: (m) => received.push(m) });

    manager.write(created.id, 'echo painel-real-ok\r');
    const end = Date.now() + 8000;
    while (Date.now() < end && !received.some((m) => m.t === 'o' && m.d.includes('painel-real-ok'))) {
      await wait(50);
    }
    const output = received.filter((m) => m.t === 'o' || m.t === 'b').map((m) => m.d).join('');
    assert.ok(output.includes('painel-real-ok'), 'a saída do comando não chegou');

    manager.remove(created.id);
    for (let i = 0; i < 50 && alive(pid); i += 1) await wait(100);
    assert.equal(alive(pid), false, 'o processo do shell deveria ter terminado');
  } finally {
    manager.shutdown();
  }
});

// RN-18: prova no Windows real que o terminal "sem administrador" de um painel elevado
// de fato não tem privilégio de administrador. Só roda se este processo está elevado.
function elevated() {
  try {
    require('node:child_process').execFileSync('net', ['session'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('RN-18: terminal real sem administrador não tem privilégio, o com administrador tem', { skip: process.platform !== 'win32' || !elevated(), timeout: 60000 }, async () => {
  const manager = createTerminalManager({ isAdmin: true });
  async function probe(admin) {
    const created = manager.create({ shell: 'cmd', name: 'PainelTeste_admin', admin });
    const received = [];
    manager.attach(created.id, { send: (m) => received.push(m) });
    const text = () => received.filter((m) => m.t === 'o' || m.t === 'b').map((m) => m.d).join('');
    await wait(admin ? 1500 : 6000);
    manager.write(created.id, 'net session >nul 2>&1 && echo RESULT_SIM || echo RESULT_NAO\r');
    const end = Date.now() + 15000;
    while (Date.now() < end && !/RESULT_(SIM|NAO)\s*\r?\n?/.test(text().replace(/echo RESULT_SIM \|\| echo RESULT_NAO/, ''))) await wait(100);
    manager.remove(created.id);
    const out = text().replace(/echo RESULT_SIM \|\| echo RESULT_NAO/, '');
    return out.includes('RESULT_SIM') ? 'sim' : out.includes('RESULT_NAO') ? 'nao' : 'sem resposta';
  }
  try {
    assert.equal(await probe(true), 'sim');
    assert.equal(await probe(false), 'nao');
  } finally {
    manager.shutdown();
  }
});
