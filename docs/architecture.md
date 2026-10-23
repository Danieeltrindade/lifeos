# LifeOS — Arquitetura

## 1. Visão geral

```
┌──────────────────────────────── Navegador (SPA) ────────────────────────────────┐
│ React 19 + React Router 7                                                        │
│                                                                                  │
│  App ─► config (valida VITE_*) ─► AppProviders:                                  │
│         Tema → SupabaseContext(cliente) → Auth (sessão) → Perfil (fuso, tema)    │
│         → Fonte de dados ─► Router: PublicOnly | RequireAuth ─► AppShell         │
│                                                                                  │
│  modules/<domínio>/ Page → hook → data/ (repositório) ──┐                         │
│  components/ui · components/layout · lib/ (puro)        │ supabase-js            │
│                                                          │ (chave publishable +   │
│                                                          │  JWT do usuário)       │
└──────────────────────────────────────────────────────────┼───────────────────────┘
                                                           ▼
┌────────────────────────────────── Supabase ─────────────────────────────────────┐
│ Auth (e-mail+senha, PKCE) · PostgREST · PostgreSQL 17                            │
│   RLS em todas as tabelas · FKs compostas (fk, user_id) · constraints/triggers   │
│   RPC: dashboard_summary, sessões de foco, export_my_data, delete_my_account     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Não há servidor próprio: o "servidor confiável" é o PostgreSQL. **Toda regra de segurança e de
integridade vive no banco** (RLS, constraints, triggers, funções); a interface repete validações
apenas para dar feedback rápido. Rotas protegidas no frontend são experiência, não segurança.

## 2. Estrutura de diretórios

```
src/
  app/                 Composição: registro de módulos, rotas, guardas, providers, App
    modules.ts         FONTE ÚNICA de rotas/navegação/status dos módulos
    router.tsx         Rotas públicas (auth) + privadas (derivadas de modules.ts)
    route-guards.tsx   RequireAuth / PublicOnly
    SetupRequiredPage  Exibida quando as variáveis do Supabase faltam ou são inseguras
  components/
    ui/                Primitivos sem regra de negócio (Button, Card, Field, Notice, States…)
    layout/            AppShell, Sidebar, navegação móvel, AccountPanel, PageHeader
  modules/             Cada módulo: Página(s), components/, data/ (consultas e escritas), logic/ (regras puras + testes)
    auth/              Entrar, cadastro, recuperação e redefinição de senha; schemas Zod
    dashboard/         Resumo do servidor + plano de hoje montado na interface (agenda, hábitos)
    tasks/ projects/   Lista, Kanban (dnd-kit), detalhe, dependências, subtarefas; projetos e marcos
    studies/           Matérias, tópicos, domínio, cronômetro, reflexão, revisões
    goals/ habits/     Metas por ciclo e hábitos (sequência/consistência)
    activities/ diary/ Atividades por tipo e categorias; diário privado
    calendar/          FullCalendar, recorrência (logic/recurrence.ts), conflitos, divisão de séries, planejado × realizado
    planning/          Planejamento adaptativo (heurística explicável), disponibilidade e preferências
    analytics/         Estatísticas por período (Recharts + tabela), revisão semanal; logic/ com toda a matemática
    recommendations/   Regras explícitas (logic/rules.ts), sincronização e tela de decisões
    settings/          Perfil, aparência, conta (exportar, excluir), ferramentas de dev
    shared/            Introdução de módulo, 404
  services/
    supabase/          Cliente, configuração, tipos do banco (database.types.ts), erros
    auth/              AuthProvider (sessão), mensagens de erro, URLs de retorno
    profile/           ProfileProvider (perfil, fuso efetivo, sincronização de tema)
    data-source/       Supabase (padrão) | demo | simulações (somente em dev; afetam só o dashboard)
    data/              Leituras compartilhadas entre módulos (queries.ts)
  lib/query/           QueryClient, domínios e invalidação, mutação padrão
  hooks/ lib/ types/ styles/
  tests/               Setup, cliente Supabase falso, renderApp, integração (projeto real)
supabase/
  config.toml          Configuração do CLI (ambiente local)
  migrations/          Esquema versionado (SQL)
  tests/database/      Testes pgTAP (RLS, regras, funções)
  tests/local/         Validação sem Docker: shim do Supabase + runner
docs/                  Especificação, arquitetura, design system, dados, decisões, setup, privacidade
```

## 3. Regras de dependência

```
app  ─►  modules  ─►  components, hooks, lib, services, types
modules ─✗─► outros modules   (exceto via app/modules.ts e types/)
components/ui ─✗─► modules, services
lib ─✗─► React (exceto lib/theme/*Provider) e qualquer camada acima
services/supabase ─✗─► React (exceto supabase-context.ts)
```

- Componentes visuais não fazem consultas; recebem props.
- Páginas e hooks não chamam `supabase.from(...)` diretamente: usam **repositórios**
  (`modules/*/data/*-repository.ts`, `services/profile/profile-repository.ts`).
- O cliente Supabase é **injetado por contexto** (`useSupabase`), o que permite testar toda a
  aplicação com um cliente falso que substitui só a rede.

## 4. Camada de dados

| Etapa | Onde | Responsabilidade |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------- |
| Cliente | `services/supabase/client.ts` | `createClient<Database>` com PKCE, sessão persistida e renovação automática |
| Tipos | `services/supabase/database.types.ts` | Formato do `supabase gen types`; tipam tabelas, inserts, updates e RPCs |
| Consulta/mutação | repositórios (`fetchProfile`, `updateProfile`, `createSupabaseDashboardRepository`, `exportMyData`…) | Uma função por operação; seleciona só as colunas necessárias; aceita `AbortSignal` |
| Validação | Zod | Entradas (formulários) e **respostas JSON** de RPC (`dashboardSummarySchema`), cujo teste de contrato usa o JSON real do Postgres |
| Erros | `services/supabase/errors.ts` | `toAppError` → `kind` estável (network, session_expired, permission, conflict, validation, not_found, unknown) + mensagem segura |
| Cache e estado de servidor | TanStack Query (`lib/query`, `services/data/queries.ts`) | Chaves por domínio, invalidação coordenada (ADR-023/024), `QueryState` padroniza carregando/erro/pronto |
| Escritas | `useLifeosMutation` (`lib/query/mutations.ts`) | Converte erros, mostra aviso (toast), revalida domínios afetados; otimista só com desfazer |

**Sessão expirada.** Se o servidor recusar o token (`PGRST301/303`, HTTP 401), o repositório lança
`AppError('session_expired')`; o hook chama `auth.handleSessionExpired()`, a sessão local é encerrada e
`RequireAuth` leva ao login com o aviso "Sua sessão expirou", preservando o destino. Se a renovação
automática do supabase-js falhar, o evento `SIGNED_OUT` não solicitado produz o mesmo efeito.

**Repetições automáticas.** O supabase-js repete consultas GET que falham por rede (com espera
crescente) antes de reportar o erro; mutações não são repetidas.

**Volume e paginação.** O PostgREST do Supabase devolve **no máximo 1000 linhas por requisição**
(`max_rows`), mesmo que o cliente peça `.limit(5000)` — e sem erro. Por isso toda leitura de lista usa
`fetchAll` (`services/supabase/result.ts`): páginas de 1000 com `.range()`, ordenação total (sempre
terminando em `id`) e um teto de 50.000 linhas que gera erro explícito (“escolha um período menor”) em
vez de truncar em silêncio. Tabelas que crescem sem limite (atividades, marcações, eventos) também são
lidas por **janela de datas**; estatísticas são agregadas no banco (`stats_*`) e não trazem registros
brutos. A simulação de testes (`tests/fake-db.ts`) aplica o mesmo teto de 1000 linhas, para que uma
lista sem paginação falhe nos testes e não só em produção (`result.test.ts`).

**Rede instável sem duplicatas.** Formulários de criação geram o `id` no navegador uma vez
(`useDraftId`) e o reenviam a cada tentativa; `insertOnce` trata a violação de chave primária como
"já gravado" e devolve a linha existente (`docs/data-model.md` §11.2, teste `e2e/resilience.spec.ts`).

**Callbacks de quem chamou.** `useLifeosMutation.mutate(vars, { onSuccess })` sempre executa os
callbacks da chamada, mesmo se o componente que chamou foi desmontado pela revalidação (por exemplo,
a sessão ativa some ao ser encerrada) — o comportamento padrão do TanStack Query os descartaria, e a
reflexão pós-sessão e o redirecionamento após excluir deixavam de acontecer (ADR-040).

**Mensagens do banco.** `toAppError` exibe apenas mensagens escritas pelo próprio LifeOS (RAISE nas
migrations) e traduz restrições conhecidas (ex.: `habit_checkins_one_per_day`); qualquer outro texto
do servidor vira mensagem genérica.

## 5. Estado

| Tipo                       | Onde                                                               | Exemplo                              |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Sessão                     | supabase-js (`localStorage`, chave `lifeos-auth`) → `AuthProvider` | usuário logado, recuperação de senha |
| Perfil                     | `ProfileProvider` (carregado uma vez por sessão)                   | fuso, início da semana, tema         |
| Estado de servidor         | TanStack Query (cache em memória, um por usuário)                  | tarefas, sessões, metas, dashboard   |
| Preferência do dispositivo | `localStorage` validado por Zod                                    | cache do tema, fonte de dados (dev)  |
| Estado de interface        | `useState` local                                                   | gaveta aberta                        |

TanStack Query adotado na Fase 3 (ADR-023). O único estado persistido no navegador além da sessão é
preferência de dispositivo (tema, fonte de dados em dev) — nada de dados de negócio. Estado de filtros
fica na tela; a visão Lista/Kanban fica na URL (`?visao=kanban`).

## 6. Autenticação

- E-mail e senha via Supabase Auth, fluxo **PKCE** (ADR-012). Links de e-mail trazem um código de uso
  único trocado por sessão no mesmo navegador.
- Rotas: `/entrar`, `/cadastro`, `/recuperar-senha` (somente sem sessão) e `/redefinir-senha`
  (sessão de recuperação). Todo o restante exige sessão.
- `?redirectTo=` só aceita caminhos internos (`lib/redirect.ts`), evitando _open redirect_.
- Cadastro e recuperação respondem da mesma forma exista ou não a conta (sem enumeração de e-mails).
- Ações destrutivas (excluir conta) exigem reautenticação com senha.

## 7. Tema

- Preferência `light | dark | system` aplicada antes da primeira pintura (`public/theme-init.js`,
  carregado por `index.html` — arquivo próprio para a CSP não precisar liberar scripts embutidos) a
  partir do `localStorage`.
- Com sessão, a preferência do **perfil** prevalece ao carregar e mudanças locais são gravadas no
  perfil (`ThemeProfileSync`). O `localStorage` permanece como cache contra flash.

## 8. Navegação e acessibilidade

- `app/modules.ts` gera rotas, sidebar, gaveta e barra inferior; um teste garante que todo link
  interno aponta para uma rota existente.
- "Pular para o conteúdo"; foco movido para `<main>` e `<title>` atualizado a cada rota.
- Formulários: rótulos visíveis, `aria-invalid` + `aria-describedby` nos erros, alvos de 44 px,
  `autocomplete` correto (`current-password`, `new-password`, `email`).
- Avisos: `role="alert"` para erros, `role="status"` para confirmações.

## 9. Segurança

| Camada      | Medida                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banco       | RLS em 100% das tabelas; 4 políticas do dono (`user_id = (select auth.uid())`); `anon` sem privilégios; FKs compostas; `user_id` imutável                |
| Funções     | `SECURITY INVOKER` por padrão; só `delete_my_account` e o trigger de cadastro são `DEFINER`, com `search_path = ''`                                      |
| Colunas     | GRANT por coluna em `profiles` e `recommendations` (o navegador só altera o que pode)                                                                    |
| Navegador   | Só URL + chave publishable; recusa `service_role`/`secret`; nada de segredos com prefixo `VITE_`                                                         |
| Mensagens   | Erros do banco nunca exibidos crus; sem enumeração de contas                                                                                             |
| Verificação | Testes de catálogo (pgTAP) falham se uma tabela nova vier sem RLS, sem as políticas ou com FK simples                                                    |
| Hospedagem  | `vercel.json`: CSP (scripts só do próprio site, conexões só com `*.supabase.co`), `nosniff`, `frame-ancestors 'none'`, HSTS; testados no `vite preview`  |
| Erros       | `RouteError` substitui a página de erro padrão (inglês, com pilha): mensagem em português, sem detalhes técnicos; versão desatualizada recarrega uma vez |

Não há Edge Functions: nenhuma operação desta fase exige privilégios além do que o RLS permite. Se
surgirem (envio de lembretes, por exemplo), cada uma deverá validar o JWT do chamador e documentar a
autorização (ADR-014).

## 10. Testes

Resumo; detalhes, comandos e requisitos em [`docs/testing.md`](testing.md).

| Nível                 | Ferramenta                                    | Cobre                                                                                                               |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Unidade e componentes | Vitest + Testing Library + PostgREST falso    | lógica pura (fusos, recorrência, métricas, regras, planejador) e fluxos de cada tela                                |
| Banco                 | pgTAP (524 asserções)                         | RLS de todas as tabelas, regras de negócio, funções, estatísticas, recomendações, exclusões sem órfãos              |
| Integração            | Vitest + Auth/PostgREST/PostgreSQL reais      | login, isolamento entre duas contas em todas as tabelas, consistência dos indicadores                               |
| Ponta a ponta         | Playwright + build de produção sob a CSP real | jornada completa de uma conta nova, rede instável, isolamento pela interface, acessibilidade (axe) e responsividade |

## 11. Qualidade

- TypeScript estrito (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- ESLint `strict-type-checked` + regras de hooks do React; Prettier.
- `npm run check` executa tudo em sequência.

## 12. Evolução prevista

1. Conectar o projeto Supabase real e rodar `npm run test:integration` com as funções da Fase 4.
2. Reduzir o pacote inicial (dividir auth/configurações; hoje ~230 kB gzip).
3. CI (GitHub Actions): `npm run check` + `db:test:local` em um serviço PostgreSQL.
4. Notificações/lembretes (modelo `reminders` existe; falta agendador) e PWA/offline.
