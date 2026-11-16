# Documentação

A documentação é a fonte da verdade do projeto e é escrita **antes** do código. Toda mudança de comportamento atualiza os documentos afetados no mesmo Pull Request ([definição de pronto](processo/definicao-de-pronto.md)).

## Por onde começar

- Quer entender o que o sistema faz? → [casos de uso](produto/casos-de-uso.md) e [histórias de usuário](produto/historias-de-usuario.md)
- Quer ver as telas? → [protótipos](prototipos/README.md) e [mapa do site](produto/mapa-do-site.md)
- Quer saber o que é exigido? → [ERS](requisitos/ers.md) e [regras de negócio](requisitos/regras-de-negocio.md)
- Quer entender como é feito? → [visão geral da arquitetura](arquitetura/visao-geral.md) e [ADRs](arquitetura/adr/README.md)
- Quer colaborar? → [git workflow](processo/git-workflow.md), [nomenclatura](processo/nomenclatura.md) e [CONTRIBUTING](../CONTRIBUTING.md)
- Quer instalar? → [instalação](operacao/instalacao.md) e [acesso remoto](operacao/acesso-remoto.md)

## Mapa dos documentos

| Pasta | Conteúdo |
|---|---|
| [`requisitos/`](requisitos/) | [ERS](requisitos/ers.md) (RF e RNF), [regras de negócio](requisitos/regras-de-negocio.md), [rastreabilidade](requisitos/rastreabilidade.md) |
| [`produto/`](produto/) | [casos de uso](produto/casos-de-uso.md), [histórias de usuário](produto/historias-de-usuario.md), [mapa do site](produto/mapa-do-site.md) |
| [`prototipos/`](prototipos/) | Wireframes HTML estáticos de cada tela |
| [`arquitetura/`](arquitetura/) | [Visão geral](arquitetura/visao-geral.md), [provedores](arquitetura/provedores.md), [segurança e ameaças](arquitetura/seguranca.md), [ADRs](arquitetura/adr/README.md) |
| [`processo/`](processo/) | [Git workflow](processo/git-workflow.md), [nomenclatura](processo/nomenclatura.md), [versionamento](processo/versionamento.md), [estratégia de testes](processo/estrategia-de-testes.md), [definição de pronto](processo/definicao-de-pronto.md) |
| [`operacao/`](operacao/) | [Instalação e operação](operacao/instalacao.md), [acesso remoto](operacao/acesso-remoto.md) |

## Identificadores

`RF-nn` requisito funcional · `RNF-nn` requisito não funcional · `RN-nn` regra de negócio · `UC-nn` caso de uso · `US-nn` história de usuário · `NNNN` ADR. IDs são estáveis: nunca reutilizados nem renumerados. Veja [nomenclatura](processo/nomenclatura.md#identificadores-da-documentação).

## Convenções

- Idioma: PT-BR, com acentuação correta. Diagramas em Mermaid.
- Exemplos usam dados genéricos (`MinhaTarefa`, `meu-servico`); nunca dados pessoais.
- Links relativos entre documentos.
