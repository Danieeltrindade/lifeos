# LifeOS

Sistema pessoal para **planejar, executar, registrar e avaliar** a própria rotina — estudos, tarefas, tempo, metas, hábitos e diário — mantendo sempre separado o que foi planejado do que realmente aconteceu.

> **Estado atual: Fase 1 — fundação.** Arquitetura, design system, temas, navegação responsiva e dashboard com estados. Ainda não há backend: nenhum dado pessoal é armazenado. Veja [o roadmap](docs/product-specification.md#9-roadmap-e-critérios-de-conclusão-por-fase).

## Requisitos

- Node.js **22.12 ou superior** (LTS recomendado) e npm 10+.

## Como executar

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Comando                           | O que faz                                              |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | Servidor de desenvolvimento                            |
| `npm run build`                   | Checagem de tipos + build de produção em `dist/`       |
| `npm run preview`                 | Serve o build de produção                              |
| `npm run typecheck`               | TypeScript (modo estrito)                              |
| `npm run lint`                    | ESLint (typescript-eslint strict type-checked + hooks) |
| `npm run format` / `format:check` | Prettier                                               |
| `npm test`                        | Vitest + Testing Library                               |
| `npm run check`                   | Tudo acima em sequência                                |

## Explorando os estados do dashboard

Sem backend, o dashboard mostra o **estado vazio real**. Em **Configurações → Fonte de dados** é possível alternar para:

- **Dados de demonstração** — exemplos fictícios, sempre sinalizados na interface;
- **Simular erro** / **Simular lentidão** — para inspecionar os estados de erro e carregamento.

## Estrutura

```
src/app          registro de módulos (fonte única de rotas), router, providers
src/components   ui/ (primitivos) e layout/ (shell, navegação)
src/modules      dashboard/, settings/, shared/ (introdução de módulo, 404)
src/services     fonte de dados (Fase 2: cliente Supabase)
src/lib          funções puras (datas, tema, armazenamento)
src/types        contratos de domínio
src/styles       tokens do design system
docs/            especificação, arquitetura, design system, modelo de dados, decisões
```

## Documentação

- [Especificação do produto](docs/product-specification.md)
- [Arquitetura](docs/architecture.md)
- [Design system](docs/design-system.md)
- [Modelo de dados](docs/data-model.md)
- [Decisões (ADRs)](docs/decisions.md)
