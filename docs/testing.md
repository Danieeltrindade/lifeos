# LifeOS — Testes

Cinco camadas, do mais rápido ao mais realista. Nenhuma delas usa dados pessoais. Os testes que
escrevem dados de verdade (integração e ponta a ponta) recusam rodar contra qualquer endereço que
não seja um Supabase **local**.

| Camada                | Ferramenta                                      | O que cobre                                                                                                                                      | Comando                                      | Onde roda                     |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------- |
| Unidade e componentes | Vitest + Testing Library + PostgREST falso      | lógica pura (fusos, recorrência, métricas, regras, planejador), fluxos de cada tela, erros, estados vazios, confirmações, invalidação de cache   | `npm test`                                   | qualquer SO                   |
| Banco                 | pgTAP                                           | RLS e políticas de **todas** as tabelas, regras de negócio, funções, estatísticas, recomendações, exclusões em cascata sem órfãos                | `npm run db:test:local` / `supabase test db` | PostgreSQL 15+ com pgTAP      |
| Integração            | Vitest (node) + Auth/PostgREST/Postgres reais   | login, persistência, isolamento entre contas tabela por tabela, funções sem vazamento, consistência dos indicadores após editar/excluir          | `npm run test:integration:stack`             | pilha local (Linux) ou Docker |
| Ponta a ponta         | Playwright (build de produção + CSP real)       | jornada completa de uma conta nova (§4 do brief), rede instável sem duplicatas, isolamento pela interface, acessibilidade (axe) e responsividade | `npm run test:e2e`                           | pilha local (Linux) ou Docker |
| Estática              | TypeScript estrito, ESLint, Prettier, npm audit | tipos, regras de hooks, formatação, vulnerabilidades conhecidas                                                                                  | `npm run check` · `npm audit`                | qualquer SO                   |

## 1. Unidade e componentes (`npm test`)

- Arquivos `src/**/*.test.ts(x)`. O "banco" é um PostgREST falso em memória (`src/tests/fake-db.ts`)
  com as mesmas respostas e o mesmo teto de 1.000 linhas por requisição do servidor real; só a
  rede é simulada.
- `src/tests/render-app.tsx` monta o app inteiro (rotas, provedores, guardas) numa rota.
- Os testes de tela pré-carregam as páginas carregadas sob demanda (ADR-039), para não depender da
  velocidade do disco.

## 2. Banco (pgTAP)

`npm run db:test:local` cria um banco **novo**, aplica um shim mínimo do Supabase, todas as
migrations em ordem e roda `supabase/tests/database/*.test.sql`:

| Arquivo               | Asserções | Verifica                                                                                               |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `01_security_catalog` | 23        | RLS ligado em todas as tabelas; 4 políticas do dono; nada para `anon`; só 2 funções `SECURITY DEFINER` |
| `02_rls_isolation`    | 187       | para cada tabela, B não lê/altera/exclui/grava/vincula dados de A; funções e exportação não vazam      |
| `03_business_rules`   | 66        | regras de negócio da Fase 2 (fusos, subtarefas, ciclos de dependência, formatos)                       |
| `04_api_functions`    | 62        | `dashboard_summary` (meia-noite, horário de verão), exportação, exclusão de conta sem órfãos           |
| `05_phase3_rules`     | 86        | tarefas, projetos, cronômetro, revisões, metas, hábitos, diário, calendário                            |
| `06_phase4_rules`     | 62        | estatísticas, recomendações (ciclo de vida, deduplicação, espera), planejamento, revisão semanal       |
| `07_phase5_integrity` | 38        | monta um grafo completo de dados e exclui cada tipo de registro, conferindo o que fica e o que some    |
| `08_theme_color`      | 11        | paleta de cores por conta: padrão `ocean`, lista fechada, independente do modo, isolada pelo RLS       |
| **Total**             | **535**   |                                                                                                        |

Requisitos: `psql`, PostgreSQL 15+ e a extensão pgTAP (`apt install postgresql-16-pgtap`).
Variáveis: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`. No fluxo com Docker:
`npx supabase db reset && npx supabase test db`.

## 3. Pilha Supabase local para integração e ponta a ponta

Os testes que exercitam Auth, API e RLS de verdade precisam de um Supabase. Há dois caminhos;
nenhum toca o projeto de produção.

### 3.1 Sem Docker (Linux) — `npm run stack:start`

`supabase/stack/start.sh` usa os binários **oficiais** do Supabase Auth (GoTrue) e do PostgREST
(baixados do GitHub na primeira vez, versões fixadas no script) sobre um PostgreSQL local:

1. cria o banco `lifeos_stack` do zero, os papéis do Supabase e roda as migrations do Auth;
2. aplica as migrations do LifeOS em ordem (é também um teste de "migrations em banco limpo");
3. sobe Auth, PostgREST (`max_rows = 1000`, como no Supabase) e `gateway.mjs` (rotas `/auth/v1` e
   `/rest/v1`, chaves `sb_publishable_`/`sb_secret_`, caixa de e-mail de teste compatível com o
   Mailpit em `http://localhost:54324`);
4. cria duas contas de teste `@example.test` e grava `.env.stack.local` (fora do Git) com a URL,
   a chave publishable e as senhas geradas. A chave secreta da pilha não é gravada.

Requisitos: Linux x86-64, Node 22+, `psql`, PostgreSQL 15+ por TCP (`PGPASSWORD`). Parar:
`npm run stack:stop`.

### 3.2 Com Docker (Windows, macOS, Linux) — fluxo oficial

```bash
npx supabase start            # baixa as imagens na 1ª vez (~2–3 GB); aplica supabase/migrations
npx supabase status           # mostra API URL e a chave publishable local
```

Crie `.env.e2e.local` (fora do Git):

```ini
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key mostrada pelo status>
E2E_MAIL_API=http://127.0.0.1:54324
# contas de teste para test:integration — crie-as pelo app em http://localhost:5173 e
# confirme pelo Mailpit (http://127.0.0.1:54324)
LIFEOS_TEST_A_EMAIL=conta-a@example.test
LIFEOS_TEST_A_PASSWORD=...
LIFEOS_TEST_B_EMAIL=conta-b@example.test
LIFEOS_TEST_B_PASSWORD=...
```

e rode com `--mode e2e` / `E2E_MAIL_API` conforme abaixo.

## 4. Integração (`npm run test:integration:stack`)

Arquivos `src/tests/integration/*.integration.test.ts`, com `supabase-js` e as duas contas:

- `rls.integration.test.ts` — login, persistência, B não lê/altera/exclui/grava em nome de A,
  funções não vazam, sem login nada é acessível.
- `isolation-sweep.integration.test.ts` — A cria dados em **todas** as tabelas pela API; B tenta
  ler, alterar e excluir cada um; estatísticas e exportação de B não contêm nada de A.
- `consistency.integration.test.ts` — editar/excluir sessão muda o tempo de estudo; mudar prazo e
  excluir tarefa mudam os indicadores de prazo; editar a meta muda o alvo sem tocar nos registros
  que formam o progresso. Usa os mesmos cálculos das telas (`stats_*`, `goal_progress`).

Sem as variáveis o arquivo é **ignorado com aviso** — nunca "passa" sem ter testado. Com Docker:
`npx vitest run --config vitest.integration.config.ts --mode e2e`.

## 5. Ponta a ponta (`npm run test:e2e`)

`playwright.config.ts` gera o **build de produção** apontado para a pilha local e o serve com
`vite preview` usando os **mesmos cabeçalhos de segurança do deploy** (lidos de `vercel.json`,
inclusive a Content-Security-Policy). Recusa-se a rodar se a URL não for `localhost`.

| Arquivo                   | Cobre                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journey.spec.ts`         | 12 passos em série com uma conta criada pelo cadastro e confirmada pelo link do e-mail: conta nova vazia → matéria e tópico → cronômetro (pausa, recarga, encerramento, reflexão) e sessão manual → projeto com tarefa → evento → meta → hábito → análises → recomendações (rejeitar não recria) → editar → excluir (sem órfãos) → recarregar e conferir |
| `resilience.spec.ts`      | o servidor grava e a resposta se perde; o usuário tenta de novo; não surge duplicata (tarefa, matéria, marcação de hábito)                                                                                                                                                                                                                               |
| `isolation.spec.ts`       | a conta B não vê a matéria de A nem pelo link direto; sair encerra a sessão                                                                                                                                                                                                                                                                              |
| `a11y-responsive.spec.ts` | axe-core (WCAG 2.1 A/AA) em 22 telas logadas + 3 públicas, temas claro e escuro; nenhuma rolagem horizontal em 360, 390, 768, 1024, 1280 e 1440 px nos dois temas; nenhum erro de JS nem violação de CSP; teclado (pular para o conteúdo, foco preso no diálogo, Esc fecha, foco volta, anel visível)                                                    |

Qualquer erro de JavaScript ou de console durante a jornada falha o teste.

Com Docker: `E2E_MODE=e2e npm run test:e2e` (lê `.env.e2e.local`).

Relatório HTML com traces das falhas: `test-results/e2e-report/index.html`.

## 6. Sequência recomendada antes de publicar

```bash
npm ci
npm run check                 # tipos, lint, formatação, unidade, build
npm audit                     # 0 vulnerabilidades esperado
npm run db:test:local         # pgTAP (ou: npx supabase test db)
npm run stack:start           # ou: npx supabase start
npm run test:integration:stack
npm run test:e2e
npm run stack:stop
```

## 7. O que os testes automáticos NÃO cobrem

- O **projeto Supabase de produção** (configurações do painel: URLs de redirecionamento, SMTP,
  Max rows, proteção de senhas). Ver o checklist de `docs/deployment.md`.
- Envio real de e-mail (a pilha captura os e-mails localmente).
- Navegadores além do Chromium (Firefox/Safari não são testados automaticamente).
- Leitores de tela reais: o axe verifica a estrutura (rótulos, papéis, contraste), não a
  experiência completa com NVDA/VoiceOver.
