'use strict';

// Ponto de entrada: carrega a configuração, monta as dependências e inicia o servidor.

const { loadConfig, CONFIG_PATH, AUDIT_PATH } = require('./config');
const { createAudit } = require('./audit');
const { createAuth } = require('./auth');
const { createServer } = require('./server');
const { detectAdmin } = require('./system');

function main() {
  let config;
  try {
    config = loadConfig({ file: CONFIG_PATH });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!config.tokenHash) {
    console.error('Token não configurado. Execute: npm run gerar-token');
    process.exit(1);
  }

  const audit = createAudit({ file: AUDIT_PATH });
  const auth = createAuth({
    tokenHash: config.tokenHash,
    sessionMs: config.sessionHours * 3600 * 1000,
  });
  const admin = detectAdmin();
  const server = createServer({ config, auth, audit, isAdmin: admin });

  server.listen(config.port, config.host, () => {
    console.log(`Painel em http://${config.host}:${config.port} (administrador: ${admin ? 'sim' : 'não'})`);
    if (config.exposed) console.warn('AVISO: escutando fora do loopback (RN-10).');
    audit.record({
      action: 'inicio',
      result: 'ok',
      detail: { host: config.host, port: config.port, exposed: config.exposed, admin },
    });
  });

  server.on('error', (err) => {
    console.error(`Falha ao iniciar o servidor: ${err.message}`);
    process.exit(1);
  });
}

main();
