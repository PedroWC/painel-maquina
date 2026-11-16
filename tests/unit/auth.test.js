'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateToken, hashToken, verifyToken, createAuth } = require('../../src/auth');

const TOKEN = 'um-token-qualquer-de-teste';
const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;

function makeAuth(overrides = {}) {
  const clock = { t: 1_000_000 };
  const auth = createAuth({
    tokenHash: hashToken(TOKEN),
    sessionMs: 12 * HOUR,
    now: () => clock.t,
    ...overrides,
  });
  return { auth, clock };
}

test('RN-16: o hash não contém o token e usa sal aleatório', () => {
  const a = hashToken(TOKEN);
  const b = hashToken(TOKEN);
  assert.ok(a.startsWith('scrypt$'));
  assert.equal(a.includes(TOKEN), false);
  assert.notEqual(a, b);
});

test('RN-16: verifyToken aceita o token correto e recusa os demais', () => {
  const stored = hashToken(TOKEN);
  assert.equal(verifyToken(TOKEN, stored), true);
  assert.equal(verifyToken('outro', stored), false);
  assert.equal(verifyToken('', stored), false);
  assert.equal(verifyToken('x'.repeat(1000), stored), false);
  assert.equal(verifyToken(TOKEN, 'formato-invalido'), false);
  assert.equal(verifyToken(TOKEN, ''), false);
  assert.equal(verifyToken(undefined, stored), false);
});

test('RN-16: tokens gerados são longos e únicos', () => {
  const tokens = new Set(Array.from({ length: 20 }, generateToken));
  assert.equal(tokens.size, 20);
  for (const t of tokens) assert.ok(t.length >= 40);
});

test('RF-01: login com token correto cria uma sessão válida', () => {
  const { auth } = makeAuth();
  const result = auth.login('1.1.1.1', TOKEN);
  assert.equal(result.ok, true);
  assert.equal(auth.isValid(result.sid), true);
});

test('RF-01: login com token incorreto não cria sessão', () => {
  const { auth } = makeAuth();
  const result = auth.login('1.1.1.1', 'errado');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid');
  assert.equal(auth.isValid(result.sid), false);
});

test('RF-01: cada login gera um identificador de sessão diferente', () => {
  const { auth } = makeAuth();
  const a = auth.login('1.1.1.1', TOKEN).sid;
  const b = auth.login('1.1.1.1', TOKEN).sid;
  assert.notEqual(a, b);
});

test('RN-01: após 5 falhas o login é bloqueado, mesmo com o token correto', () => {
  const { auth } = makeAuth();
  for (let i = 0; i < 5; i += 1) {
    assert.equal(auth.login('2.2.2.2', 'errado').reason, 'invalid');
  }
  const blocked = auth.login('2.2.2.2', TOKEN);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'locked');
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 5 * MINUTE);
});

test('RN-01: o bloqueio vale por 5 minutos e depois libera', () => {
  const { auth, clock } = makeAuth();
  for (let i = 0; i < 5; i += 1) auth.login('3.3.3.3', 'errado');
  clock.t += 5 * MINUTE - 1;
  assert.equal(auth.login('3.3.3.3', TOKEN).reason, 'locked');
  clock.t += 2;
  assert.equal(auth.login('3.3.3.3', TOKEN).ok, true);
});

test('RN-01: login bem-sucedido zera o contador de falhas', () => {
  const { auth } = makeAuth();
  for (let i = 0; i < 4; i += 1) auth.login('4.4.4.4', 'errado');
  assert.equal(auth.login('4.4.4.4', TOKEN).ok, true);
  for (let i = 0; i < 4; i += 1) assert.equal(auth.login('4.4.4.4', 'errado').reason, 'invalid');
  assert.equal(auth.login('4.4.4.4', TOKEN).ok, true);
});

test('RN-01: o bloqueio é por endereço e não afeta outros', () => {
  const { auth } = makeAuth();
  for (let i = 0; i < 5; i += 1) auth.login('5.5.5.5', 'errado');
  assert.equal(auth.login('5.5.5.5', TOKEN).reason, 'locked');
  assert.equal(auth.login('6.6.6.6', TOKEN).ok, true);
});

test('RN-02: a sessão expira após 12 horas', () => {
  const { auth, clock } = makeAuth();
  const { sid } = auth.login('7.7.7.7', TOKEN);
  clock.t += 12 * HOUR - 1;
  assert.equal(auth.isValid(sid), true);
  clock.t += 2;
  assert.equal(auth.isValid(sid), false);
});

test('RF-02: o logout invalida a sessão imediatamente', () => {
  const { auth } = makeAuth();
  const { sid } = auth.login('8.8.8.8', TOKEN);
  auth.logout(sid);
  assert.equal(auth.isValid(sid), false);
});

test('RF-02: identificadores inválidos nunca são aceitos', () => {
  const { auth } = makeAuth();
  assert.equal(auth.isValid(undefined), false);
  assert.equal(auth.isValid(''), false);
  assert.equal(auth.isValid('inexistente'), false);
});
