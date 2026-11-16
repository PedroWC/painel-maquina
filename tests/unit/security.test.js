'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SECURITY_HEADERS,
  hostName,
  hostAllowed,
  originAllowed,
  parseCookies,
  sessionCookie,
  clearedCookie,
} = require('../../src/security');

const config = { allowedHosts: ['Painel.Exemplo'] };

test('RNF-01: hostName remove porta e colchetes do IPv6', () => {
  assert.equal(hostName('localhost:8780'), 'localhost');
  assert.equal(hostName('127.0.0.1:8780'), '127.0.0.1');
  assert.equal(hostName('[::1]:8780'), '::1');
  assert.equal(hostName('LocalHost'), 'localhost');
  assert.equal(hostName(undefined), '');
  assert.equal(hostName('[::1'), '');
});

test('RNF-01: Host de loopback e de allowedHosts é aceito', () => {
  assert.equal(hostAllowed('localhost:8780', config), true);
  assert.equal(hostAllowed('127.0.0.1:1', config), true);
  assert.equal(hostAllowed('[::1]:8780', config), true);
  assert.equal(hostAllowed('painel.exemplo', config), true);
});

test('RNF-01: qualquer outro Host é recusado (DNS rebinding)', () => {
  assert.equal(hostAllowed('evil.example', config), false);
  assert.equal(hostAllowed('evil.example:8780', config), false);
  assert.equal(hostAllowed('192.0.2.10:8780', config), false);
  assert.equal(hostAllowed('', config), false);
  assert.equal(hostAllowed(undefined, config), false);
});

test('RNF-01: Origin precisa coincidir com o Host; ausência é aceita', () => {
  assert.equal(originAllowed(undefined, '127.0.0.1:8780'), true);
  assert.equal(originAllowed('http://127.0.0.1:8780', '127.0.0.1:8780'), true);
  assert.equal(originAllowed('http://LOCALHOST:8780', 'localhost:8780'), true);
  assert.equal(originAllowed('http://evil.example', '127.0.0.1:8780'), false);
  assert.equal(originAllowed('http://127.0.0.1:9999', '127.0.0.1:8780'), false);
  assert.equal(originAllowed('null', '127.0.0.1:8780'), false);
  assert.equal(originAllowed('lixo', '127.0.0.1:8780'), false);
});

test('RNF-01: cookies são lidos sem tolerar duplicatas maliciosas', () => {
  assert.deepEqual(parseCookies('sid=abc; outro=1'), { sid: 'abc', outro: '1' });
  assert.deepEqual(parseCookies('sid=primeiro; sid=segundo'), { sid: 'primeiro' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies('semigual'), {});
});

test('RN-02: o cookie de sessão é HttpOnly, SameSite=Strict e expira com a sessão', () => {
  const cookie = sessionCookie('abc', 43200);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=43200/);
  assert.match(cookie, /Path=\//);
  assert.match(clearedCookie(), /Max-Age=0/);
});

test('RNF-01: cabeçalhos de segurança obrigatórios estão definidos', () => {
  assert.match(SECURITY_HEADERS['Content-Security-Policy'], /default-src 'self'/);
  assert.doesNotMatch(SECURITY_HEADERS['Content-Security-Policy'], /script-src[^;]*unsafe-inline/);
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
});
