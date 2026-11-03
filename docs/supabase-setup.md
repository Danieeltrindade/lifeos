# LifeOS — Configurando o Supabase

Guia para ligar o LifeOS a um projeto Supabase, aplicar o esquema e confirmar que autenticação,
persistência e isolamento entre contas funcionam. Os nomes de menus seguem o painel do Supabase
em outubro de 2026; se algo mudar de lugar, procure pelo mesmo nome.

> **Segredos.** O navegador recebe apenas a **URL** e a chave **publishable** (ou a `anon`
> legada). A **secret key** (`sb_secret_…`), a `service_role` e a **senha do banco** nunca vão
> para o `.env.local`, para o Git ou para ninguém. O app se recusa a iniciar se detectar uma
> chave privilegiada nas variáveis `VITE_`.

## 1. Criar o projeto

1. Acesse <https://supabase.com/dashboard> e clique em **New project**.
2. Nome: `lifeos`. Defina uma senha forte para o banco e guarde-a num gerenciador de senhas.
3. Região: **South America (São Paulo)** — menor latência a partir do Brasil.
4. Aguarde o provisionamento (1–2 minutos).

## 2. URL e chave pública

- **Project Settings → Data API → Project URL** — algo como `https://abcdefghijkl.supabase.co`.
- **Project Settings → API Keys → Publishable key** — começa com `sb_publishable_`. Em projetos
  antigos, use a aba **Legacy API keys → anon public**.

O identificador do projeto (`project ref`) é o trecho `abcdefghijkl` da URL.

## 3. Variáveis de ambiente

```bash
cp .env.example .env.local      # no Windows: copy .env.example .env.local
```

Preencha:

```ini
VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`.env.local` está no `.gitignore`. Reinicie `npm run dev` depois de alterar o arquivo.

## 4. Aplicar as migrations

As migrations ficam em `supabase/migrations/` e são aplicadas **em ordem de nome**:

| Arquivo                                          | Conteúdo                                                  |
| ------------------------------------------------ | --------------------------------------------------------- |
| `20261020190000_foundation.sql`                  | Convenções, schema `private`, perfis, trigger de cadastro |
| `20261020190100_planning.sql`                    | Projetos, tarefas, subtarefas, dependências               |
| `20261020190200_studies.sql`                     | Matérias, tópicos, anotações, sessões, pausas, revisões   |
| `20261020190300_tracking.sql`                    | Categorias, atividades, hábitos, metas, diário            |
| `20261020190400_calendar.sql`                    | Eventos, recorrência, exceções                            |
| `20261020190500_engagement.sql`                  | Recomendações, lembretes                                  |
| `20261020190600_api_functions.sql`               | Funções RPC (cronômetro, dashboard, exportação, exclusão) |
| `20261021120000_tasks_projects.sql`              | Tarefas e projetos completos (Fase 3)                     |
| `20261021120100_studies_activities.sql`          | Estudos e atividades (Fase 3)                             |
| `20261021120200_reviews_reflections.sql`         | Revisões e reflexões (Fase 3)                             |
| `20261021120300_goals_habits_diary.sql`          | Metas, hábitos e diário (Fase 3)                          |
| `20261021120400_api_v2.sql`                      | Funções RPC da Fase 3                                     |
| `20261022120000_integration_recommendations.sql` | Integração entre módulos e recomendações (Fase 4)         |
| `20261022120100_analytics.sql`                   | Estatísticas, planejamento e exportação v3 (Fase 4)       |
| `20261023120000_phase5_integrity.sql`            | Correção de integridade nas exclusões (Fase 5)            |

São **15 arquivos**. Aplique sempre todos, na ordem.

### Opção A — Supabase CLI (recomendada: registra o histórico de migrations)

Requer Node 22+. O CLI é baixado sob demanda pelo `npx`.

```bash
npx --yes supabase@2 login                 # abre o navegador para autorizar
npm run db:link                            # pergunta o project ref e a senha do banco
npm run db:push                            # mostra as migrations pendentes e pede confirmação
```

`db push` aplica só o que ainda não foi aplicado e grava o histórico em
`supabase_migrations.schema_migrations`. **Nunca edite uma migration já aplicada**: crie um arquivo
novo (`npx supabase@2 migration new <nome>`).

### Opção B — SQL Editor (sem CLI)

Em **SQL Editor → New query**, cole e execute **cada arquivo, na ordem da tabela acima**, um por
vez. Esse caminho não registra o histórico; se depois você passar a usar o CLI, marque as
migrations como aplicadas antes do primeiro `db push`:

```bash
npx --yes supabase@2 migration repair --status applied 20261020190000 20261020190100 20261020190200 20261020190300 20261020190400 20261020190500 20261020190600 20261021120000 20261021120100 20261021120200 20261021120300 20261021120400 20261022120000 20261022120100 20261023120000
```

### Validar antes de aplicar em produção

O esquema é validado de três formas, da mais rápida à mais completa:

1. **Banco descartável sem Docker** (Linux, macOS ou WSL, com PostgreSQL 15+ e pgTAP instalados):

   ```bash
   PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run db:test:local
   ```

   Cria um banco **novo**, aplica um _shim_ mínimo do Supabase (papéis `anon`/`authenticated`,
   `auth.users`, `auth.uid()`), todas as migrations e os testes de `supabase/tests/database/`.

2. **Supabase local com Docker** (idêntico à nuvem):

   ```bash
   npx --yes supabase@2 start        # sobe Postgres, Auth e API locais (baixa ~2–3 GB na 1ª vez)
   npx --yes supabase@2 db reset     # recria o banco e aplica as migrations do zero
   npx --yes supabase@2 test db      # roda os testes pgTAP
   ```

3. **Projeto de homologação na nuvem**: crie um segundo projeto (ex.: `lifeos-staging`), aplique
   com `db push` e rode os testes de integração (§8) antes de aplicar no projeto principal.

## 5. Configurar a autenticação

**Authentication → URL Configuration**

| Campo         | Desenvolvimento                                                                                                                                        | Produção (exemplo)                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Site URL      | `http://localhost:5173`                                                                                                                                | `https://lifeos.seudominio.com`                                                           |
| Redirect URLs | `http://localhost:5173/entrar`<br>`http://localhost:5173/redefinir-senha`<br>`http://localhost:4173/entrar`<br>`http://localhost:4173/redefinir-senha` | `https://lifeos.seudominio.com/entrar`<br>`https://lifeos.seudominio.com/redefinir-senha` |

Os e-mails de confirmação voltam para `/entrar?confirmado=1` e os de recuperação para
`/redefinir-senha` (`src/services/auth/auth-redirects.ts`). URLs fora da lista são recusadas pelo
Supabase — isso impede que alguém use os seus e-mails para redirecionar a um site malicioso.

**Authentication → Sign In / Providers → Email**

- **Enable email provider**: ligado.
- **Confirm email**: ligado (recomendado; o app trata os dois casos).
- **Minimum password length**: `8` (o formulário exige o mesmo).
- **Secure password change**: ligado.

**E-mails.** O servidor de e-mail embutido do Supabase serve apenas para testes e tem um limite
baixo de envios por hora. Antes de abrir o app para outras pessoas, configure um SMTP próprio em
**Authentication → Emails → SMTP Settings**. Os modelos padrão de e-mail funcionam com o fluxo PKCE
usado pelo app; não é preciso alterá-los.

Os links de confirmação e recuperação precisam ser abertos **no mesmo navegador** em que o pedido
foi feito (PKCE). Em outro navegador o e-mail é confirmado mesmo assim, e a tela de login explica
que basta entrar com a senha.

**Limite de linhas da API.** Em **Project Settings → Data API → Max rows**, mantenha o padrão
(**1000**) ou um valor maior. O app lê listas em páginas de 1000; um valor menor faria a leitura parar
antes do fim.

## 6. Iniciar a aplicação

```bash
npm install
npm run dev            # http://localhost:5173
```

Sem `.env.local` válido, o app mostra a tela **Configuração necessária** listando o que falta.

## 7. Verificar a conexão (persistência real)

1. Abra `http://localhost:5173` → **Criar conta** → informe nome, e-mail e senha.
2. Abra o link de confirmação recebido por e-mail **neste navegador** e entre.
3. No dashboard deve aparecer "Seu LifeOS ainda está vazio — e isso é o estado real." (o resumo
   veio da função `dashboard_summary`).
4. Em **Configurações → Perfil**, mude o nome e o fuso e clique em **Salvar perfil**.
5. Recarregue a página (F5): você continua logado e os valores permanecem.
6. No painel do Supabase, **Table Editor → profiles**: a linha da sua conta mostra os novos valores.
7. **Configurações → Exportar meus dados** baixa um JSON com o seu perfil.

## 8. Testar o isolamento entre contas (RLS)

### 8.1 No banco (pgTAP)

`supabase/tests/database/` tem 524 asserções em sete arquivos (detalhes em `docs/testing.md` §2); os quatro primeiros cobrem a segurança:

| Arquivo               | Verifica                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01_security_catalog` | RLS em todas as tabelas; 4 políticas do dono por tabela; nada para `anon`; só 2 funções `SECURITY DEFINER`; `search_path` fixo; FKs compostas; índices                                   |
| `02_rls_isolation`    | Para **cada** tabela: B não lê, não altera, não exclui dados de A; não grava em nome de A; não liga registros próprios a registros de A; funções não vazam dados; `anon` não acessa nada |
| `03_business_rules`   | RN-04/05/06/11/12, subtarefas, ciclos de dependência, fusos, formatos de calendário, recomendações                                                                                       |
| `04_api_functions`    | `dashboard_summary` (meia-noite, horário de verão, troca de fuso), exportação, exclusão de conta sem órfãos                                                                              |

Execute com a opção 1 ou 2 da seção 4.

### 8.2 Pela API, no projeto real

1. Crie **duas contas de teste** pelo próprio app (e-mails seus, por exemplo com `+a` e `+b`:
   `voce+lifeos-a@gmail.com`) e confirme as duas. Não use sua conta pessoal.
2. Crie `.env.test.local` (fora do Git):

   ```ini
   LIFEOS_TEST_A_EMAIL=voce+lifeos-a@gmail.com
   LIFEOS_TEST_A_PASSWORD=...
   LIFEOS_TEST_B_EMAIL=voce+lifeos-b@gmail.com
   LIFEOS_TEST_B_PASSWORD=...
   ```

3. Rode `npm run test:integration`. O teste entra com as duas contas e verifica, pela API pública,
   que B não lê/altera/exclui os dados de A, não grava em nome de A, não liga uma tarefa ao projeto
   de A e que funções não vazam dados; e que sem login nada é acessível. Os registros criados são
   removidos no final.

Sem as variáveis, o arquivo é **ignorado com um aviso** — nunca "passa" sem ter testado.

## 9. Tipos do banco

`src/services/supabase/database.types.ts` segue o formato do `supabase gen types`. Depois de
qualquer migration nova:

```bash
npm run db:types       # requer `npm run db:link` feito antes
```

Confira o diff: mudanças inesperadas indicam que a interface precisa acompanhar o esquema.

## 10. Antes de produção

- [ ] SMTP próprio configurado; remetente com domínio verificado (SPF/DKIM).
- [ ] Site URL e Redirect URLs apenas com o domínio de produção (sem `localhost`).
- [ ] Projeto de homologação separado para validar migrations.
- [ ] Backups: plano com Point-in-Time Recovery ou rotina de `pg_dump` testada.
- [ ] Proteção contra senhas vazadas e CAPTCHA no cadastro (Authentication → Attack Protection).
- [ ] Revisar **Advisors → Security** no painel (deve estar sem alertas).
- [ ] Política de privacidade publicada (ver `docs/privacy.md`).
