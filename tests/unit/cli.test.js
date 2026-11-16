'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli, cleanCliError } = require('../../src/cli');
const { HttpError } = require('../../src/validate');

function fakeExec(result) {
  const calls = [];
  const execFile = (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(result.err || null, result.stdout || '', result.stderr || '');
  };
  return { execFile, calls };
}

const status = (code) => (err) => err instanceof HttpError && err.status === code;

test('RN-12: executa com lista de argumentos, sem shell, e devolve a saída', async () => {
  const { execFile, calls } = fakeExec({ stdout: 'saída', stderr: 'aviso' });
  const cli = createCli({ execFile, timeoutMs: 1234 });
  const out = await cli.run('docker', ['ps', '-a', '; calc']);
  assert.deepEqual(out, { stdout: 'saída', stderr: 'aviso' });
  assert.equal(calls[0].file, 'docker');
  assert.deepEqual(calls[0].args, ['ps', '-a', '; calc']);
  assert.equal(calls[0].options.shell, undefined);
  assert.equal(calls[0].options.timeout, 1234);
  assert.equal(calls[0].options.windowsHide, true);
});

test('RN-14: o tempo limite pode ser ajustado por chamada', async () => {
  const { execFile, calls } = fakeExec({});
  await createCli({ execFile }).run('docker', ['info'], { timeoutMs: 50 });
  assert.equal(calls[0].options.timeout, 50);
});

test('RN-11: ferramenta ausente vira 404 com mensagem clara', async () => {
  const err = Object.assign(new Error('spawn pm2 ENOENT'), { code: 'ENOENT' });
  await assert.rejects(createCli({ execFile: fakeExec({ err }).execFile }).run('pm2', ['jlist']), (e) => {
    assert.ok(status(404)(e));
    assert.match(e.message, /pm2 não está instalado/);
    return true;
  });
});

test('RN-14: tempo esgotado vira 504', async () => {
  const err = Object.assign(new Error('timeout'), { killed: true });
  await assert.rejects(createCli({ execFile: fakeExec({ err }).execFile }).run('kubectl', ['get']), status(504));
});

test('RN-14: falha do comando vira 502 com a mensagem limpa e limitada', async () => {
  const err = new Error('exit 1');
  const stderr = `linha 1\r\nlinha 2\nlinha 3\nlinha 4\nlinha 5\n${'x'.repeat(1000)}`;
  await assert.rejects(createCli({ execFile: fakeExec({ err, stderr }).execFile }).run('docker', ['x']), (e) => {
    assert.ok(status(502)(e));
    assert.equal(e.message.split('\n').length, 4);
    assert.equal(e.message.includes('\r'), false);
    return true;
  });
  assert.ok(cleanCliError('y'.repeat(2000)).length <= 400);
  assert.equal(cleanCliError(''), 'Falha ao executar a ferramenta.');
});
