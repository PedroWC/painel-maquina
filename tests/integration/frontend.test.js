'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, request } = require('../helpers/server');

test('RF-03: todos os arquivos referenciados pela página inicial são servidos', async () => {
  const srv = await startTestServer();
  try {
    const home = await request({ port: srv.port, path: '/' });
    const refs = [...home.text.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.includes('/vendor/xterm.js'));
    assert.ok(refs.includes('/vendor/addon-fit.js'));
    assert.ok(refs.includes('/terminais.js'));
    for (const ref of refs) {
      const res = await request({ port: srv.port, path: ref });
      assert.equal(res.status, 200, `${ref} -> ${res.status}`);
    }
  } finally {
    await srv.close();
  }
});

test('RF-03: o xterm servido expõe as classes usadas pela interface', async () => {
  const srv = await startTestServer();
  try {
    const xterm = await request({ port: srv.port, path: '/vendor/xterm.js' });
    assert.match(xterm.headers['content-type'], /javascript/);
    assert.match(xterm.text, /Terminal/);
    const fit = await request({ port: srv.port, path: '/vendor/addon-fit.js' });
    assert.match(fit.text, /FitAddon/);
    const css = await request({ port: srv.port, path: '/vendor/xterm.css' });
    assert.match(css.headers['content-type'], /text\/css/);
  } finally {
    await srv.close();
  }
});

test('RNF-01: a interface não usa scripts inline nem innerHTML (CSP e XSS)', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', '..', 'public');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/, `${file} usa API insegura`);
  }
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'index.html tem script inline');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'index.html tem manipulador inline');
});
