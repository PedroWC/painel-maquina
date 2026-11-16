'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPowerShell, encode, cleanError, PREFIX } = require('../../src/powershell');
const { HttpError } = require('../../src/validate');

function fakeExec(result) {
  const calls = [];
  const execFile = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const out = typeof result === 'function' ? result(calls.length) : result;
    callback(out.err || null, out.stdout || '', out.stderr || '');
  };
  return { execFile, calls };
}

const decode = (b64) => Buffer.from(b64, 'base64').toString('utf16le');

test('RN-17: o script segue estático em -EncodedCommand e os dados vão só por PP_PARAMS', async () => {
  const { execFile, calls } = fakeExec({ stdout: 'ok' });
  const ps = createPowerShell({ execFile });
  const hostile = "'; Remove-Item C:\\ -Recurse; '";
  await ps.run('Write-Output $p.name', { name: hostile });

  const [call] = calls;
  assert.ok(call.file.toLowerCase().endsWith('powershell.exe'));
  assert.ok(call.args.includes('-EncodedCommand'));
  assert.ok(call.args.includes('-NonInteractive'));
  const script = decode(call.args[call.args.indexOf('-EncodedCommand') + 1]);
  assert.equal(script, PREFIX + 'Write-Output $p.name');
  assert.equal(script.includes('Remove-Item'), false);
  assert.deepEqual(JSON.parse(call.options.env.PP_PARAMS), { name: hostile });
  assert.equal(call.options.windowsHide, true);
});

test('RN-17: encode usa Base64 de UTF-16LE do prefixo mais o script', () => {
  assert.equal(decode(encode('Get-Date')), `${PREFIX}Get-Date`);
});

test('RF-07: runJson interpreta a saída JSON e trata saída vazia', async () => {
  const ps = createPowerShell({ execFile: fakeExec({ stdout: '  [{"a":1}]\r\n' }).execFile });
  assert.deepEqual(await ps.runJson('x'), [{ a: 1 }]);
  const empty = createPowerShell({ execFile: fakeExec({ stdout: '   ' }).execFile });
  assert.equal(await empty.runJson('x'), null);
});

test('RF-07: saída que não é JSON vira erro 500 genérico', async () => {
  const ps = createPowerShell({ execFile: fakeExec({ stdout: 'lixo' }).execFile });
  await assert.rejects(ps.runJson('x'), (err) => err instanceof HttpError && err.status === 500);
});

test('RNF-07: erros do PowerShell (CLIXML) viram mensagem limpa e limitada', async () => {
  const clixml =
    '#< CLIXML\r\n<Objs><S S="Error">TAREFA_NAO_EXISTE_x000D__x000A_</S><S S="Error">detalhe &lt;x&gt;</S></Objs>';
  const ps = createPowerShell({ execFile: fakeExec({ err: new Error('falhou'), stderr: clixml }).execFile });
  await assert.rejects(ps.run('x'), (err) => {
    assert.equal(err.status, 500);
    assert.match(err.message, /TAREFA_NAO_EXISTE/);
    assert.match(err.message, /detalhe <x>/);
    assert.equal(err.message.includes('CLIXML'), false);
    return true;
  });
  assert.ok(cleanError('x'.repeat(5000)).length <= 400);
  assert.equal(cleanError(''), 'Falha ao executar o comando do sistema.');
});

test('RN-14: tempo esgotado vira erro 504', async () => {
  const err = Object.assign(new Error('timeout'), { killed: true });
  const ps = createPowerShell({ execFile: fakeExec({ err }).execFile });
  await assert.rejects(ps.run('x'), (e) => e instanceof HttpError && e.status === 504);
});
