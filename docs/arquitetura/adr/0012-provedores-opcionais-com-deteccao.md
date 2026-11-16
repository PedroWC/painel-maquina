# 0012. Provedores opcionais com detecção em tempo de execução

- **Status:** aceito
- **Data:** 2026-11-16

## Contexto
O operador quer gerenciar tecnologias como Docker, pm2, Kubernetes, Podman e WSL, mas elas variam entre máquinas e podem ser instaladas depois. Uma interface com abas de ferramentas ausentes confundiria, e cada nova tecnologia não deve exigir mudanças no núcleo.

## Decisão
Cada tecnologia é um **provedor** em `src/providers/`, que cumpre um contrato comum definido em `base.js`:

- `id` e `nome`;
- `detect()` → `{ disponivel, versao }`;
- `list()` → recursos;
- `actions` → allowlist de operações, cada uma com `destrutiva: true|false`;
- `logs(id)`.

O `registry.js` detecta os provedores na inicialização e periodicamente. A API `GET /api/providers` informa o que existe e a interface monta as abas a partir dela. Provedor ausente não aparece e suas rotas respondem 404 ([RN-11](../../requisitos/regras-de-negocio.md#rn-11)). Cada chamada tem tempo limite e falhas são isoladas ([RN-14](../../requisitos/regras-de-negocio.md#rn-14)). Docker é o primeiro provedor e as rotas de recursos seguem o padrão `/api/p/:id/...`.

## Alternativas consideradas
- Abas fixas para todas as ferramentas: poluem a interface e geram erros quando a ferramenta não existe.
- Plugins carregados de fora do repositório: flexível, mas abre um vetor de execução de código em um processo elevado.

## Consequências
Adicionar uma tecnologia é criar um arquivo que cumpre o contrato, com testes e documentação. A detecção periódica consome pouco, mas faz algumas chamadas curtas ao sistema a cada ciclo.
