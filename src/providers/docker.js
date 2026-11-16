'use strict';

// Provedor Docker (RF-15, RF-16): containers e imagens pela CLI `docker`. A lógica comum fica em
// container-engine.js; aqui só o que é específico do Docker (formato da saída e motor parado).

const { createContainerEngineProvider, createFriendly } = require('./container-engine');

const ENGINE_DOWN = /failed to connect to the docker api|cannot connect to the docker daemon|docker_engine|error during connect/i;
const ENGINE_DOWN_MESSAGE = 'O Docker está instalado, mas o motor não está respondendo. Inicie o Docker Desktop e tente novamente.';

const friendly = createFriendly(ENGINE_DOWN, ENGINE_DOWN_MESSAGE);

// `docker ps --format {{json .}}` imprime um objeto JSON por linha.
function parseLines(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function createDockerProvider({ cli }) {
  return createContainerEngineProvider({
    cli,
    id: 'docker',
    nome: 'Docker',
    executable: 'docker',
    versionPattern: /Docker version ([^,\s]+)/,
    infoArgs: ['info', '--format', '{{.ServerVersion}}'],
    containersArgs: ['ps', '-a', '--format', '{{json .}}'],
    imagesArgs: ['images', '--format', '{{json .}}'],
    friendly,
    parseContainers: (stdout) =>
      parseLines(stdout).map((c) => ({ id: c.ID, name: c.Names, image: c.Image, state: c.State, status: c.Status, ports: c.Ports })),
    parseImages: (stdout) => parseLines(stdout).map((i) => ({ id: i.ID, name: `${i.Repository}:${i.Tag}`, size: i.Size })),
  });
}

module.exports = { createDockerProvider, friendly };
