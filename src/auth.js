'use strict';

// Autenticação por token com sessão em memória (RF-01, RF-02, RN-01, RN-02,
// RN-16). O token só existe em claro na geração; em disco fica o hash scrypt.

const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;
const MAX_TOKEN_LENGTH = 256;

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(token, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyToken(token, stored) {
  if (typeof token !== 'string' || typeof stored !== 'string') return false;
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  const [algorithm, saltHex, hashHex] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(token, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

function createAuth({
  tokenHash,
  sessionMs,
  maxFailures = 5,
  lockMs = 5 * 60 * 1000,
  now = Date.now,
}) {
  const sessions = new Map(); // sid -> expira em (ms)
  const failures = new Map(); // ip -> { count, lockedUntil }

  function prune(t) {
    if (failures.size < 1000) return;
    for (const [ip, entry] of failures) {
      if (entry.lockedUntil && entry.lockedUntil <= t) failures.delete(ip);
    }
  }

  // RN-01: após maxFailures falhas seguidas, novas tentativas são recusadas por
  // lockMs, mesmo com o token correto.
  function login(ip, token) {
    const t = now();
    prune(t);
    const entry = failures.get(ip);
    if (entry && entry.lockedUntil > t) {
      return { ok: false, reason: 'locked', retryAfterMs: entry.lockedUntil - t };
    }
    if (entry && entry.lockedUntil && entry.lockedUntil <= t) failures.delete(ip);

    if (verifyToken(token, tokenHash)) {
      failures.delete(ip);
      const sid = crypto.randomBytes(32).toString('base64url');
      sessions.set(sid, t + sessionMs);
      return { ok: true, sid };
    }

    const current = failures.get(ip) || { count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= maxFailures) current.lockedUntil = t + lockMs;
    failures.set(ip, current);
    return { ok: false, reason: 'invalid', retryAfterMs: 0 };
  }

  // RN-02: a sessão expira após sessionMs.
  function isValid(sid) {
    if (typeof sid !== 'string') return false;
    const expiresAt = sessions.get(sid);
    if (!expiresAt) return false;
    if (expiresAt <= now()) {
      sessions.delete(sid);
      return false;
    }
    return true;
  }

  function logout(sid) {
    sessions.delete(sid);
  }

  return { login, isValid, logout };
}

module.exports = { generateToken, hashToken, verifyToken, createAuth };
