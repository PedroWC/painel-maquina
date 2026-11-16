'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Caminho absoluto: evita executar outro "whoami" que esteja antes no PATH.
const WHOAMI = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');

// Nível de integridade "alto" (S-1-16-12288) indica processo elevado.
function detectAdmin() {
  try {
    const out = execFileSync(WHOAMI, ['/groups'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    return out.includes('S-1-16-12288');
  } catch {
    return false;
  }
}

module.exports = { detectAdmin };
