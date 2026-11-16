'use strict';

// Provedor Podman (RF-21): containers e imagens pela CLI `podman`, que é compatível com a do
// Docker. A lógica comum fica em container-engine.js; aqui só o que é específico do Podman.
//
// O Podman imprime `--format json` como UMA lista JSON (o Docker imprime um objeto por linha) e
// com campos diferentes (Names é uma lista, Ports são objetos, o tamanho vem em bytes). No Windows
// ele depende de uma máquina virtual (podman machine); parada, vira mensagem amigável.

const { HttpError } = require('../validate');
const { createContainerEngineProvider, createFriendly } = require('./container-engine');

const ENGINE_DOWN =
  /cannot connect to podman|unable to connect to podman|podman machine|connection refused|dial unix|npipe|failed to connect|the system cannot find the (file|path)/i;
const ENGINE_DOWN_MESSAGE =
  'O Podman está instalado, mas a máquina do Podman não está respondendo. Execute "podman machine start" e tente novamente.';

const friendly = createFriendly(ENGINE_DOWN, ENGINE_DOWN_MESSAGE);

function parseArray(stdout) {
  const text = stdout.trim();
  if (text === '' || text === 'null') return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new HttpError(502, 'Resposta inesperada do podman.');
  }
}

const shortId = (id) => String(id || '').replace(/^sha256:/, '').slice(0, 12);

// [{ host_ip, host_port, container_port, protocol }] => "0.0.0.0:8080->80/tcp, 443/tcp"
function formatPorts(ports) {
  if (!Array.isArray(ports)) return '';
  return ports
    .map((p) => {
      const protocol = p.protocol || 'tcp';
      return p.host_port ? `${p.host_ip || '0.0.0.0'}:${p.host_port}->${p.container_port}/${protocol}` : `${p.container_port}/${protocol}`;
    })
    .join(', ');
}

function humanSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}kB`;
  return `${n}B`;
}

function imageName(image) {
  const tag = (Array.isArray(image.RepoTags) && image.RepoTags[0]) || (Array.isArray(image.Names) && image.Names[0]);
  return tag || '<none>:<none>';
}

function createPodmanProvider({ cli }) {
  return createContainerEngineProvider({
    cli,
    id: 'podman',
    nome: 'Podman',
    executable: 'podman',
    versionPattern: /podman version ([^\s]+)/i,
    infoArgs: ['info', '--format', '{{.Version.Version}}'],
    containersArgs: ['ps', '-a', '--format', 'json'],
    imagesArgs: ['images', '--format', 'json'],
    friendly,
    parseContainers: (stdout) =>
      parseArray(stdout).map((c) => ({
        id: shortId(c.Id),
        name: (Array.isArray(c.Names) ? c.Names[0] : c.Names) || shortId(c.Id),
        image: c.Image,
        state: String(c.State || '').toLowerCase(),
        status: c.Status || c.State || '—',
        ports: formatPorts(c.Ports),
      })),
    parseImages: (stdout) => parseArray(stdout).map((i) => ({ id: shortId(i.Id), name: imageName(i), size: humanSize(i.Size) })),
  });
}

module.exports = { createPodmanProvider, friendly, formatPorts, humanSize, parseArray };
