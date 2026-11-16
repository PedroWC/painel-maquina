'use strict';

// Provedor WSL (RF-22): distribuições do Subsistema do Windows para Linux (listar, encerrar uma
// distribuição, desligar o WSL e abrir terminal em uma distribuição).
//
// O wsl.exe escreve em UTF-16LE e traduz a saída, então:
//   - toda chamada usa encoding 'auto' (decodificação feita pelo executor de CLIs);
//   - os nomes e as versões vêm de `--list --verbose` (colunas NAME STATE VERSION);
//   - quem está em execução vem de `--list --running --quiet`, cruzado com os nomes conhecidos,
//     para a tradução do estado ou de mensagens nunca ser confundida com uma distribuição.

const { HttpError, badRequest, DISTRO_NAME } = require('../validate');
const { defineProvider } = require('./base');

const EXECUTABLE = 'wsl.exe';
const AUTO = { encoding: 'auto' };
const SLOW = { encoding: 'auto', timeoutMs: 30000 };
const ALL = '_todas'; // id da linha "todas as distribuições" (distribuições começam com letra ou número)
const ALL_CONFIRMATION = 'wsl';

// "* Ubuntu   Running   2": marca de padrão, nome (sem espaços), estado (pode ter 2 palavras) e versão.
const VERBOSE_LINE = /^(\*?)\s*(\S+)\s+(.+?)\s+(\d)\s*$/;

function lines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function parseVerbose(text) {
  const distros = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = VERBOSE_LINE.exec(raw.replace(/\0/g, ''));
    if (!match) continue; // cabeçalho, linhas em branco e mensagens
    const [, star, name, , version] = match;
    if (DISTRO_NAME.test(name)) distros.push({ name, version, isDefault: star === '*' });
  }
  return distros;
}

function createWslProvider({ cli }) {
  const wsl = (args, options = AUTO) => cli.run(EXECUTABLE, args, options);

  async function detect() {
    try {
      const { stdout } = await wsl(['--version'], { encoding: 'auto', timeoutMs: 8000 });
      const found = (lines(stdout)[0] || '').match(/\d+(\.\d+){1,3}/);
      return { disponivel: true, versao: found ? found[0] : 'desconhecida' };
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (err.status === 404) return { disponivel: false };
      if (err.status !== 502) throw err;
    }
    // WSL antigo não tem --version: se ao menos listar funciona, está instalado.
    try {
      await wsl(['--list', '--quiet'], { encoding: 'auto', timeoutMs: 8000 });
      return { disponivel: true, versao: 'legado' };
    } catch (err) {
      if (err instanceof HttpError && (err.status === 404 || err.status === 502)) return { disponivel: false };
      throw err;
    }
  }

  async function runningNames(known) {
    try {
      const { stdout } = await wsl(['--list', '--running', '--quiet']);
      return new Set(lines(stdout).filter((n) => known.has(n)));
    } catch {
      return new Set();
    }
  }

  async function list() {
    const columns = [
      { key: 'nome', title: 'Distribuição' },
      { key: 'versao', title: 'Versão' },
    ];
    let distros;
    try {
      distros = parseVerbose((await wsl(['--list', '--verbose'])).stdout);
    } catch (err) {
      if (err instanceof HttpError && err.status === 502) {
        // Por exemplo, "nenhuma distribuição instalada": não é falha do painel, vira aviso.
        return { aviso: err.message, sections: [{ id: 'distribuicoes', title: 'Distribuições', empty: 'Nenhuma distribuição.', columns, rows: [] }] };
      }
      throw err;
    }
    const running = await runningNames(new Set(distros.map((d) => d.name)));

    const rows = distros.map((d) => {
      const up = running.has(d.name);
      return {
        id: d.name,
        cells: { nome: d.isDefault ? `${d.name} (padrão)` : d.name, versao: `WSL ${d.version}` },
        status: up ? { texto: 'Em execução', tom: 'ok' } : { texto: 'Parada', tom: 'off' },
        actions: up ? ['terminate'] : [],
        terminal: { shell: 'wsl', distro: d.name }, // a interface oferece "Abrir terminal"
      };
    });

    const sections = [{ id: 'distribuicoes', title: 'Distribuições', empty: 'Nenhuma distribuição instalada.', columns, rows }];
    if (rows.length > 0) {
      sections.push({
        id: 'geral',
        title: 'Geral',
        columns: [{ key: 'nome', title: 'Escopo' }],
        rows: [
          {
            id: ALL,
            nomeConfirmacao: ALL_CONFIRMATION,
            cells: { nome: 'Todas as distribuições e a máquina virtual do WSL' },
            actions: ['shutdown'],
          },
        ],
      });
    }
    return { sections };
  }

  function validateId(id) {
    if (id === ALL || (typeof id === 'string' && DISTRO_NAME.test(id))) return id;
    throw badRequest('identificador inválido.');
  }

  return defineProvider({
    id: 'wsl',
    nome: 'WSL',
    timeoutMs: 40000,
    detect,
    list,
    validateId,
    nomeConfirmacao: (id) => (id === ALL ? ALL_CONFIRMATION : id),
    actions: {
      terminate: {
        rotulo: 'Encerrar',
        destrutiva: true,
        run: async (id) => {
          if (id === ALL) throw badRequest('Escolha uma distribuição para encerrar.');
          return wsl(['--terminate', id], SLOW);
        },
      },
      shutdown: {
        rotulo: 'Desligar o WSL',
        destrutiva: true,
        confirmarNome: true, // derruba todas as distribuições (inclusive o motor do Docker Desktop): digitar "wsl"
        run: async (id) => {
          if (id !== ALL) throw badRequest('O desligamento vale para todo o WSL.');
          return wsl(['--shutdown'], SLOW);
        },
      },
    },
  });
}

module.exports = { createWslProvider, parseVerbose, ALL };
