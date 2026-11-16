'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lowPrivilegeLaunch, SCRIPT, quote } = require('../../src/de-elevate');

function decode(arg) {
  return Buffer.from(arg, 'base64').toString('utf16le');
}

test('RN-18: o lançador sem privilégio usa PowerShell com script codificado e parâmetros por ambiente', () => {
  const launch = lowPrivilegeLaunch({ file: 'C:/Windows/System32/cmd.exe', args: [], cwd: 'C:/Users/x', env: { A: '1' } });
  assert.match(launch.file, /powershell\.exe$/i);
  const index = launch.args.indexOf('-EncodedCommand');
  assert.ok(index > 0);
  assert.ok(launch.args.includes('-NonInteractive'));
  const params = JSON.parse(launch.env.PP_PARAMS);
  assert.equal(params.cmdline, 'C:/Windows/System32/cmd.exe');
  assert.equal(params.cwd, 'C:/Users/x');
  assert.equal(launch.env.A, '1');
});

test('RN-17: o script do lançador é estático e nada do cliente entra nele (ADR 0006)', () => {
  const evil = 'C:/Users/x"; Remove-Item -Recurse C:/ #';
  const launch = lowPrivilegeLaunch({ file: 'cmd.exe', args: ['-d', 'Ubuntu'], cwd: evil });
  const script = decode(launch.args[launch.args.indexOf('-EncodedCommand') + 1]);
  assert.equal(script.includes('Remove-Item'), false);
  assert.equal(script.includes('Ubuntu'), false);
  assert.ok(script.includes('CreateRestrictedToken'));
  assert.equal(JSON.parse(launch.env.PP_PARAMS).cwd, evil);
  assert.equal(SCRIPT.includes('Ubuntu'), false);
});

test('RN-18: o token restrito remove privilégios e transforma os grupos de administrador em somente negar', () => {
  // DISABLE_MAX_PRIVILEGE (0x1) | LUA_TOKEN (0x4), sem rebaixar a integridade (ADR 0014)
  assert.match(SCRIPT, /CreateRestrictedToken\(token, 0x1 \| 0x4,/);
  assert.equal(/SetTokenInformation/.test(SCRIPT), false);
});

test('RN-18: argumentos com espaço ou aspas são colocados entre aspas', () => {
  assert.equal(quote('-NoLogo'), '-NoLogo');
  assert.equal(quote('C:/Arquivos de Programas/x.exe'), '"C:/Arquivos de Programas/x.exe"');
  assert.equal(quote('a"b'), '"a""b"');
  assert.equal(quote(''), '""');
  const launch = lowPrivilegeLaunch({ file: 'C:/Arquivos de Programas/bash.exe', args: ['--login', '-i'], cwd: 'C:/' });
  assert.equal(JSON.parse(launch.env.PP_PARAMS).cmdline, '"C:/Arquivos de Programas/bash.exe" --login -i');
});
