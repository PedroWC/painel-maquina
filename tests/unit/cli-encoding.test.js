'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCli, decodeOutput } = require('../../src/cli');
const { HttpError } = require('../../src/validate');

const utf16 = (text, bom = false) => Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(text, 'utf16le')]);

test('RN-12: decodeOutput lê UTF-16LE (com ou sem BOM) e UTF-8, e aceita texto já decodificado', () => {
  assert.equal(decodeOutput(utf16('Versão do WSL: 3.0.5.0')), 'Versão do WSL: 3.0.5.0');
  assert.equal(decodeOutput(utf16('* Ubuntu   Running   2', true)), '* Ubuntu   Running   2');
  assert.equal(decodeOutput(Buffer.from('saída em UTF-8: ação', 'utf8')), 'saída em UTF-8: ação');
  assert.equal(decodeOutput('já é texto'), 'já é texto');
  assert.equal(decodeOutput(undefined), '');
  assert.equal(decodeOutput(null), '');
  assert.equal(decodeOutput(Buffer.alloc(0)), '');
});

function exec(result) {
  const calls = [];
  const execFile = (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(result.err || null, result.stdout, result.stderr);
  };
  return { execFile, calls };
}

test('RN-12: com encoding "auto" a saída é pedida em bytes e devolvida decodificada', async () => {
  const { execFile, calls } = exec({ stdout: utf16('Ubuntu\r\n'), stderr: utf16('') });
  const out = await createCli({ execFile }).run('wsl.exe', ['--list', '--quiet'], { encoding: 'auto' });
  assert.equal(calls[0].options.encoding, 'buffer');
  assert.deepEqual(out, { stdout: 'Ubuntu\r\n', stderr: '' });
});

test('RN-12: sem encoding o comportamento continua sendo UTF-8 em texto', async () => {
  const { execFile, calls } = exec({ stdout: 'ok', stderr: '' });
  await createCli({ execFile }).run('docker', ['ps']);
  assert.equal(calls[0].options.encoding, 'utf8');
});

test('RN-14: a mensagem de erro em UTF-16 também é decodificada antes de ser limpa', async () => {
  const err = new Error('exit 1');
  const { execFile } = exec({ err, stdout: Buffer.alloc(0), stderr: utf16('O Subsistema do Windows para Linux não tem distribuições instaladas.\r\n') });
  await assert.rejects(createCli({ execFile }).run('wsl.exe', ['--list'], { encoding: 'auto' }), (e) => {
    assert.ok(e instanceof HttpError && e.status === 502);
    assert.match(e.message, /não tem distribuições instaladas/);
    assert.equal(e.message.includes('\0'), false);
    return true;
  });
});
