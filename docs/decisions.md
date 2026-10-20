# LifeOS — Registro de decisões arquiteturais (ADR)

Formato: contexto → decisão → consequências. Status: **Aceita**, **Proposta**, **Substituída**.

---

## ADR-001 — SPA com React, TypeScript estrito e Vite

**Status:** Aceita (Fase 1)

**Contexto.** Produto pessoal com muita interação no cliente (cronômetro, calendário, formulários), sem necessidade de SEO, e backend gerenciado (Supabase).

**Decisão.** SPA com React 19, TypeScript 6 em modo estrito (incluindo `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`) e Vite 8.

**Consequências.** Build e desenvolvimento rápidos; nenhum servidor próprio para manter. SSR/SEO não são objetivos. Se surgir necessidade de renderização no servidor, migrar para o modo _framework_ do React Router.

## ADR-002 — React Router 7 em modo de dados, rotas derivadas de um registro de módulos

**Status:** Aceita

**Contexto.** Doze módulos aparecem em quatro lugares (rotas, sidebar, gaveta, barra inferior). Listas duplicadas divergem.

**Decisão.** `src/app/modules.ts` é a fonte única; `router.tsx`, a navegação e os testes derivam dela. `createBrowserRouter` (modo de dados) prepara _loaders_ e _lazy_ para as próximas fases.

**Alternativas.** React Router 8 (lançado recentemente) — adiado até o ecossistema estabilizar; a migração a partir da v7 é planejada como pequena. TanStack Router — tipagem excelente, mas adiciona curva de aprendizado sem ganho decisivo aqui.

**Consequências.** Um teste garante que não há links internos sem destino.

## ADR-003 — Tailwind CSS 4 com tokens semânticos em variáveis CSS

**Status:** Aceita

**Decisão.** Tokens em variáveis CSS (`--lo-*`) redefinidas por tema e expostas ao Tailwind via `@theme inline`. Tema escuro por atributo `data-theme` (não por media query) para permitir escolha manual.

**Consequências.** Componentes usam `bg-surface`/`text-fg-muted` e funcionam nos dois temas sem `dark:`. Trocar a paleta é mexer em um único arquivo.

## ADR-004 — Sem biblioteca de componentes; primitivos próprios

**Status:** Aceita

**Contexto.** Bibliotecas completas (MUI, Chakra) impõem visual próprio; shadcn/ui traz Radix + utilitários.

**Decisão.** Poucos primitivos próprios (Button, Card, Badge, States, ProgressBar, SegmentedControl). Para componentes com acessibilidade complexa (menus, combobox, popover, date picker), adotar **Radix UI** pontualmente quando forem necessários, em vez de reimplementar.

**Consequências.** Identidade visual própria e poucos KB. Gaveta móvel e radio group foram implementados manualmente seguindo WAI-ARIA e cobertos por testes.

## ADR-005 — Supabase como backend definitivo, segurança no banco

**Status:** Aceita (implementação na Fase 2)

**Decisão.** Supabase Auth + PostgreSQL com RLS em todas as tabelas, constraints e funções para regras invariantes. O cliente usa apenas a chave `anon`.

**Consequências.** Isolamento entre contas desde o início; regras testáveis com pgTAP. Lógica crítica (encerrar sessão, calcular duração) em funções SQL transacionais.

## ADR-006 — `localStorage` apenas para preferências do dispositivo

**Status:** Aceita

**Decisão.** Somente preferências (tema, fonte de dados de desenvolvimento), sempre validadas com Zod e com tratamento de exceções. Dados pessoais nunca ficam apenas no navegador.

## ADR-007 — Estado de servidor: hooks com repositórios agora; TanStack Query depois

**Status:** Proposta

**Contexto.** Nesta fase há uma única leitura (dashboard) e nenhuma mutação.

**Decisão.** Hooks com máquina de estados explícita + interface de repositório. Reavaliar TanStack Query no início da Fase 3, quando houver mutações, invalidação e cache entre telas.

## ADR-008 — Biblioteca de calendário

**Status:** Proposta (decisão no início da Fase 4)

| Opção                                            | Licença      | Pontos fortes                                                      | Pontos fracos                                                                                 |
| ------------------------------------------------ | ------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **FullCalendar** (standard)                      | MIT          | Madura, visões dia/semana/mês, arrastar/redimensionar              | Recursos de _timeline/resources_ são **premium (comerciais)**; customização visual trabalhosa |
| **Schedule-X**                                   | MIT (núcleo) | Moderna, temas, mobile, drag-and-drop por plugin                   | Alguns plugins premium; comunidade menor                                                      |
| **react-big-calendar**                           | MIT          | Simples, integração React                                          | Visual datado, acessibilidade e mobile limitados                                              |
| **Implementação própria** (grade CSS + date-fns) | —            | Controle total de design, acessibilidade e "planejado × realizado" | Custo alto: arrastar, fusos, sobreposição                                                     |

**Recomendação preliminar.** Prototipar a visão semanal com **Schedule-X** e com uma grade própria. Escolher pela qualidade em 360 px, operação por teclado e facilidade de sobrepor "realizado" ao "planejado". Nenhuma dependência paga será introduzida sem aviso.

## ADR-009 — Bibliotecas adiadas

**Status:** Aceita

Recharts (Fase 6), React Hook Form (Fase 3, com `@hookform/resolvers` + Zod), Playwright (Fase 8), supabase-js (Fase 2) **não** foram instalados agora: nenhuma funcionalidade desta fase os utiliza. Zod já é usado (validação de preferências).

`eslint-plugin-jsx-a11y` não suporta ESLint 10 na versão atual; a acessibilidade é coberta por testes com consultas por papel/rótulo e revisão manual. Reavaliar quando houver suporte.

## ADR-010 — Dados de demonstração isolados e sinalizados

**Status:** Aceita

**Decisão.** Uma "fonte de dados" selecionável em Configurações: _sem backend_ (padrão, mostra o estado vazio real), _demonstração_, _simular erro_, _simular lentidão_. Dados de demonstração vivem em `demo-dashboard.ts`, carregam `origin: 'demo'` e disparam um aviso global.

**Consequências.** É possível avaliar o design e todos os estados sem violar o princípio "nenhuma estatística inventada como dado pessoal". Na Fase 2, o modo padrão passa a ser o Supabase e os demais ficam restritos ao ambiente de desenvolvimento.

## ADR-011 — Fonte tipográfica empacotada localmente

**Status:** Aceita

**Decisão.** Geist via `@fontsource-variable/geist`, servida pelo próprio app.

**Consequências.** Sem requisições a terceiros (privacidade) e funciona offline; ~50 KB de fonte variável.
