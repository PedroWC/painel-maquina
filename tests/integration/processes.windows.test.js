'use strict';

// Teste de sistema (windows): lista processos e portas reais e encerra um
// processo filho descartável criado pelo próprio teste. Nada além disso é tocado.

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createPowerShell } = require('../../src/powershell');
const { PROCESS_LIST, PROCESS_KILL } = require('../../src/ps-scripts');

const ps = createPowerShell();
const isWindows = process.platform === 'win32';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('RF-17: a listagem real traz processos e a porta em escuta deste teste', { skip: !isWindows, timeout: 60000 }, async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const data = await ps.runJson(PROCESS_LIST, {});
    assert.ok(data.procs.length > 5);
    const self = data.procs.find((p) => p.pid === process.pid);
    assert.ok(self, 'o próprio processo de teste deveria estar listado');
    assert.equal(typeof self.mem, 'number');
    assert.equal('title' in self, false, 'títulos de janela não devem ser listados');
    const mine = data.ports.find((p) => p.port === port);
    assert.ok(mine, 'a porta aberta pelo teste deveria estar listada');
    assert.equal(mine.pid, process.pid);
  } finally {
    server.close();
  }
});

test('RF-17: encerra de verdade um processo filho descartável', { skip: !isWindows, timeout: 60000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  try {
    await wait(500);
    assert.equal(alive(child.pid), true);
    const name = (await ps.run(PROCESS_KILL, { pid: child.pid })).trim();
    assert.match(name, /node/i);
    for (let i = 0; i < 30 && alive(child.pid); i += 1) await wait(100);
    assert.equal(alive(child.pid), false);
    await assert.rejects(ps.run(PROCESS_KILL, { pid: child.pid }), /PROCESSO_NAO_EXISTE/);
  } finally {
    if (alive(child.pid)) child.kill();
  }
});
