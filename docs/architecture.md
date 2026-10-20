# LifeOS — Arquitetura

## 1. Visão geral

```
┌───────────────────────────── Navegador ─────────────────────────────┐
│  React 19 + React Router 7 (SPA)                                    │
│                                                                     │
│  app/ ──► providers (Tema, Fonte de dados) ──► router ──► AppShell   │
│                                         │                           │
│                         modules/<domínio>/ Page → hooks → data/     │
│                                         │           (repositório)   │
│  components/ui, components/layout  ◄────┘                           │
│  lib/ (puro, testável)   types/ (contratos)   services/ (infra)     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ Fase 2: supabase-js (anon key + JWT)
┌────────────────────────────────▼────────────────────────────────────┐
│ Supabase: Auth · PostgreSQL (RLS em todas as tabelas) · RPC/views   │
└─────────────────────────────────────────────────────────────────────┘
```

A aplicação é uma SPA. Não há servidor próprio nesta fase; na Fase 2 o "servidor" é o Supabase: **toda regra de segurança e integridade vive no banco** (RLS, constraints, triggers, funções), e a interface apenas repete validações para dar feedback rápido.

## 2. Estrutura de diretórios

```
src/
  app/                 Composição: registro de módulos, rotas, providers, App
    modules.ts         FONTE ÚNICA de rotas/navegação/status dos módulos
    router.tsx         Rotas derivadas de modules.ts
  components/
    ui/                Primitivos visuais sem regra de negócio (Button, Card, Badge, States…)
    layout/            AppShell, Sidebar, navegação móvel, PageHeader, ThemeToggle
  modules/
    dashboard/         Página, seções, hook de estado e camada data/ (repositório + demo)
    settings/          Preferências
    shared/            Páginas genéricas (introdução de módulo, 404)
  services/
    data-source/       Seleção da fonte de dados (sem backend, demo, simulações)
  hooks/               Hooks transversais (useNow, useFocusTrap, useRouteChange)
  lib/                 Funções puras: datas, tema, armazenamento seguro, cn
  types/               Contratos de domínio compartilhados
  styles/              Tokens e CSS global
  tests/               Setup e utilitários de teste
docs/                  Esta documentação
```

Não existem diretórios vazios "para depois". Cada módulo ganha a sua pasta em `src/modules/` quando for implementado, com o formato:

```
modules/<modulo>/
  <Modulo>Page.tsx       Página (composição)
  components/            Componentes visuais do módulo
  use<Algo>.ts           Hooks de estado
  data/                  Repositório (interface + implementações) e mapeamentos
  schemas.ts             Schemas Zod (formulários e validação de respostas)
  *.test.ts(x)           Testes junto ao código
```

## 3. Regras de dependência

```
app  ─►  modules  ─►  components, hooks, lib, services, types
modules ─✗─► outros modules   (exceto via app/modules.ts e types/)
components/ui ─✗─► modules, services
lib ─✗─► React (exceto lib/theme/*Provider) e qualquer camada acima
```

- Componentes visuais **não** buscam dados nem contêm regras de negócio; recebem props.
- Hooks de módulo orquestram estado; **repositórios** fazem I/O. A página não conhece a origem dos dados.
- Imports entre camadas usam o alias `@/`; o ESLint proíbe `../../`.
- Regras puras (tema, datas, cálculos de duração) ficam em `lib/` e são testadas sem React.

## 4. Fluxo de dados

1. A página chama um hook (`useDashboardSummary`).
2. O hook obtém o repositório pela fonte de dados ativa (`getDashboardRepository(mode)`).
3. O repositório devolve um contrato tipado (`DashboardSummary`), com `origin` (`user` | `demo`).
4. O hook expõe uma **máquina de estados explícita**: `loading → ready | empty | error`, com `retry`. Requisições obsoletas são canceladas com `AbortController`.

Na Fase 2 entra `supabaseDashboardRepository`, que consulta uma função/visão agregada no PostgreSQL. Avaliar a adoção de TanStack Query quando houver mutações e cache entre telas (ADR-007); hoje o hook simples é suficiente e evita dependência prematura.

## 5. Estado

| Tipo                       | Onde                                                        | Exemplo                                 |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Preferência do dispositivo | `localStorage` validado por Zod                             | tema, fonte de dados de desenvolvimento |
| Estado de servidor         | Repositórios + hooks (Fase 2: possivelmente TanStack Query) | resumo do dashboard                     |
| Estado de interface        | `useState` local                                            | gaveta aberta                           |
| Estado global              | Context mínimo                                              | tema, fonte de dados                    |

Não há store global (Redux/Zustand): não há necessidade identificada.

## 6. Tema

- Preferência `light | dark | system` (Zod) em `localStorage` (`lifeos:theme`).
- Script inline em `index.html` aplica `data-theme` **antes da primeira pintura** (sem flash). `ThemeProvider` assume depois e acompanha `prefers-color-scheme` enquanto a preferência for `system`.
- Tailwind usa a variante `dark` ligada a `[data-theme=dark]`; os componentes usam tokens semânticos, não cores cruas, então quase nunca precisam de `dark:`.
- Fase 2: sincronizar a preferência com o perfil no Supabase (localStorage continua como cache para evitar flash).

## 7. Navegação e acessibilidade

- `app/modules.ts` gera rotas, sidebar, gaveta e barra inferior. Um teste garante que todo link interno aponta para uma rota existente.
- Link "Pular para o conteúdo"; a cada troca de rota o foco vai para `<main>` e o `<title>` é atualizado.
- Gaveta móvel: `role="dialog"`, `aria-modal`, foco preso, `Esc` fecha, foco devolvido ao gatilho, fundo `inert` e sem rolagem.
- Seletor de tema segue o padrão WAI-ARIA _radio group_ (setas).
- `prefers-reduced-motion` desativa animações.

## 8. Segurança (planejada para a Fase 2)

- Somente a chave `anon` no cliente; nunca `service_role`.
- RLS habilitado em **todas** as tabelas, com políticas `user_id = auth.uid()` para `select/insert/update/delete`.
- `user_id` preenchido por `default auth.uid()` e imutável (trigger), nunca confiado ao cliente.
- Constraints e triggers para regras invariantes (RN-04, RN-05, RN-06, RN-08).
- Testes de RLS com pgTAP em `supabase/tests/` executados no CI.
- Variáveis em `.env.local` (fora do Git); `.env.example` versionado.

## 9. Testes

| Nível                  | Ferramenta                       | Situação                                                                     |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| Unidade (lógica pura)  | Vitest                           | tema, datas, regras do resumo                                                |
| Componentes/integração | Vitest + Testing Library (jsdom) | navegação completa com rotas reais, tema, estados do dashboard, gaveta móvel |
| Banco/RLS              | pgTAP (Supabase CLI)             | Fase 2                                                                       |
| Ponta a ponta          | Playwright                       | Fase 8 (ou antes, para o cronômetro)                                         |

## 10. Qualidade

- TypeScript estrito com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- ESLint com `typescript-eslint` _strict type-checked_ e regras de hooks do React.
- Prettier para formatação.
- `npm run check` executa tudo em sequência (uso local e futuro CI).

## 11. Evolução prevista

1. **Fase 2:** `src/services/supabase/client.ts`, autenticação (rotas protegidas e tela de login), migrações em `supabase/migrations/`, repositórios Supabase por módulo, tipos gerados (`supabase gen types`).
2. Code splitting por rota (`lazy`) quando os módulos crescerem.
3. CI (GitHub Actions) rodando `npm run check` e testes de RLS.
4. PWA/offline avaliado após Fase 3.
