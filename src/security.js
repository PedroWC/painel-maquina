'use strict';

// Verificações de borda HTTP: Host (contra DNS rebinding), Origin (CSRF),
// cookies e cabeçalhos de segurança (RNF-01).

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '::1']);

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

function hostName(header) {
  if (typeof header !== 'string') return '';
  const value = header.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? '' : value.slice(1, end);
  }
  return value.replace(/:\d+$/, '');
}

function hostAllowed(header, config) {
  const name = hostName(header);
  if (!name) return false;
  if (LOOPBACK_NAMES.has(name)) return true;
  return config.allowedHosts.some((allowed) => allowed.toLowerCase() === name);
}

// Sem Origin (cliente que não é navegador) é aceito; ainda assim a rota exige
// cookie de sessão e o cabeçalho X-Requested-With. Com Origin, precisa coincidir
// com o Host da requisição.
function originAllowed(origin, hostHeader) {
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || typeof hostHeader !== 'string') return false;
  try {
    return new URL(origin).host.toLowerCase() === hostHeader.trim().toLowerCase();
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key && !(key in cookies)) cookies[key] = part.slice(index + 1).trim();
  }
  return cookies;
}

function sessionCookie(sid, maxAgeSeconds) {
  return `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

function clearedCookie() {
  return 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}

module.exports = {
  SECURITY_HEADERS,
  hostName,
  hostAllowed,
  originAllowed,
  parseCookies,
  sessionCookie,
  clearedCookie,
};
