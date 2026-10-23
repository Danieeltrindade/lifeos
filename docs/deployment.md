# LifeOS — Publicação (GitHub, Supabase e Vercel)

O LifeOS é uma SPA estática (Vite) que fala direto com o Supabase. Publicar envolve três contas:

| Serviço  | Papel                                           | O que fica lá                                      |
| -------- | ----------------------------------------------- | -------------------------------------------------- |
| GitHub   | Código-fonte e histórico                        | repositório (sem `.env*`, sem segredos)            |
| Supabase | Banco PostgreSQL, Auth e API REST com RLS       | migrations aplicadas, configuração de autenticação |
| Vercel   | Hospeda o build estático e aplica `vercel.json` | duas variáveis públicas (`VITE_SUPABASE_*`)        |

Nada aqui é feito automaticamente: cada passo depende de acesso às suas contas. Os valores entre
`<...>` são seus; não há URLs nem chaves reais neste repositório.

> **Regra de ouro dos segredos.** Só duas variáveis vão para o navegador: a URL do projeto e a
> chave **publishable** (`sb_publishable_…`, ou a `anon` dos projetos antigos). A chave **secret**
> (`sb_secret_…`), a `service_role` e a senha do banco **nunca** entram no repositório, na Vercel
> ou no app. O app se recusa a iniciar se receber uma chave secreta.

## 1. GitHub

1. Confira que nada sensível será enviado:

   ```bash
   git status --short            # .env.local, .env.*.local e test-results/ NÃO podem aparecer
   git check-ignore -v .env.local .env.stack.local
   ```

2. Faça o commit do trabalho:

   ```bash
   git add -A
   git commit -m "LifeOS: fases 2 a 5"
   ```

3. No GitHub, crie um repositório **privado** vazio (sem README, sem .gitignore) e envie:

   ```bash
   git branch -M main
   git remote add origin https://github.com/<seu-usuario>/<nome-do-repo>.git
   git push -u origin main
   ```

## 2. Supabase (produção)

Siga `docs/supabase-setup.md` §1–5. Em resumo:

1. **Criar o projeto** (região São Paulo, `sa-east-1`, para menor latência). Guarde a senha do banco
   num gerenciador de senhas — ela não vai para o app.
2. **Aplicar as migrations** (15 arquivos em `supabase/migrations/`, em ordem):

   ```bash
   npx supabase login
   npm run db:link -- --project-ref <ref-do-projeto>   # pede a senha do banco
   npx supabase db push --dry-run                      # confira a lista antes
   npm run db:push
   ```

3. **Authentication → URL Configuration**
   - Site URL: `https://<seu-dominio>` (ex.: `https://lifeos-<usuario>.vercel.app`).
   - Redirect URLs: `https://<seu-dominio>/entrar` e `https://<seu-dominio>/redefinir-senha`.
     Remova `localhost` deste projeto (use outro projeto para desenvolvimento).
4. **Authentication → Sign In / Providers → Email**: provedor ligado, **Confirm email** ligado,
   senha mínima 8, **Secure password change** ligado.
5. **Authentication → Attack Protection**: ligue a proteção contra senhas vazadas (planos que a
   oferecem) e, se for abrir o cadastro ao público, CAPTCHA.
6. **Authentication → Emails → SMTP Settings**: SMTP próprio com domínio verificado (SPF/DKIM). O
   servidor embutido é só para testes e envia poucos e-mails por hora.
7. **Project Settings → Data API → Max rows**: 1000 ou mais (padrão).
8. **Advisors → Security** e **Performance**: devem ficar sem alertas.
9. Anote **Project URL** e **Publishable key** (Project Settings → API Keys).

## 3. Vercel

1. **Add New → Project → Import** o repositório do GitHub. A Vercel detecta Vite; `vercel.json`
   já define `npm run build`, a pasta `dist`, o redirecionamento de rotas da SPA e os cabeçalhos.
2. **Environment Variables** (ambiente _Production_):

   | Nome                            | Valor                       |
   | ------------------------------- | --------------------------- |
   | `VITE_SUPABASE_URL`             | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`          |

3. **Node.js Version** (Settings → Build and Deployment): 22.x ou superior (`package.json` exige
   ≥ 22.12).
4. **Deploy.** Ao terminar, volte ao Supabase e confira que a Site URL e as Redirect URLs usam o
   domínio final.

**Deploys de pré-visualização (Preview).** Cada branch ganha uma URL própria, que o Supabase de
produção recusa nos e-mails de confirmação. Para testar branches, use um projeto Supabase de
homologação e cadastre as variáveis dele só no ambiente _Preview_.

### O que `vercel.json` faz

- **Rotas da SPA:** qualquer caminho que não seja arquivo em `/assets/` devolve `index.html`, então
  recarregar `/tarefas` funciona. Arquivo inexistente em `/assets/` responde 404 (não HTML).
- **Cache:** `/assets/*` (nomes com hash) é imutável por 1 ano; `index.html` sempre revalida — um
  deploy novo chega na próxima recarga. Uma aba aberta com a versão anterior que tente abrir uma
  tela cujo arquivo sumiu recarrega sozinha uma vez (`src/app/RouteError.tsx`).
- **Cabeçalhos de segurança:**
  - `Content-Security-Policy`: scripts só do próprio site (nenhum script embutido — o ajuste de tema
    antes da pintura é `public/theme-init.js`); conexões só com o próprio site e
    `https://*.supabase.co` / `wss://*.supabase.co`; sem `iframe` de terceiros (`frame-ancestors 'none'`);
    estilos embutidos permitidos (FullCalendar e Recharts os usam); fontes `data:` (ícones do
    FullCalendar).
  - `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` (câmera,
    microfone, localização desligados) e `Strict-Transport-Security`.

  Os testes ponta a ponta rodam com **esses mesmos cabeçalhos** (`vite preview` os lê de
  `vercel.json`), então uma violação de CSP quebra a suíte antes do deploy.

## 4. Domínio próprio (opcional)

1. Vercel → Project → **Domains** → adicione o domínio e configure o DNS indicado.
2. Supabase → atualize Site URL e Redirect URLs para o domínio novo.
3. Se usar **domínio personalizado no Supabase** (ex.: `api.seudominio.com`), acrescente-o ao
   `connect-src` da CSP em `vercel.json` e use-o em `VITE_SUPABASE_URL`.

## 5. Verificação depois do deploy (5 minutos)

1. Abra o site em janela anônima → tela de login, sem erros no console (F12).
2. Crie uma conta com um e-mail seu → o e-mail chega → o link volta para `/entrar?confirmado=1`.
3. Entre → o dashboard mostra "Seu LifeOS ainda está vazio" (sem dados de demonstração).
4. Crie uma tarefa, recarregue a página → ela continua lá.
5. Recarregue em `/tarefas` diretamente → a tela abre (rotas da SPA).
6. Sair → voltar → os dados continuam; outra conta não os vê.
7. Configurações → "Exportar meus dados (JSON)" → o arquivo contém só os seus registros.
8. Ferramentas do navegador → Network → a resposta de `/` tem `content-security-policy`.

## 6. Atualizações

1. Mudanças de banco sempre em uma **migration nova** (nunca editar uma já aplicada).
2. Ordem: `npm run check` → testes de banco/ponta a ponta → `npx supabase db push --dry-run` →
   `npm run db:push` → `npm run db:types` (confira o diff) → push para o GitHub (a Vercel publica).
   As migrations do LifeOS são aditivas, então aplicar o banco antes do front não quebra a versão
   em produção.
3. **Reverter o front:** Vercel → Deployments → versão anterior → _Promote to Production_.
4. **Reverter o banco:** não há "down migrations"; escreva uma migration corretiva. Com dados reais,
   faça backup antes (`npx supabase db dump --data-only -f backup.sql`) ou use PITR, se o plano tiver.

## 7. Checklist de produção

- [ ] `npm run check`, `npm audit`, pgTAP, integração e ponta a ponta passando (`docs/testing.md`).
- [ ] Nenhum `.env*` nem segredo no repositório (`git ls-files | grep -i env` só mostra `.env.example`).
- [ ] Repositório GitHub privado.
- [ ] Projeto Supabase de produção separado do de desenvolvimento/testes.
- [ ] 15 migrations aplicadas (`npx supabase migration list` sem pendências).
- [ ] Site URL e Redirect URLs apenas com o domínio de produção.
- [ ] Confirmação de e-mail ligada; senha mínima 8; proteção contra senhas vazadas.
- [ ] SMTP próprio configurado e testado.
- [ ] Max rows ≥ 1000.
- [ ] Advisors do Supabase sem alertas de segurança.
- [ ] Backups: plano com PITR ou rotina de `db dump` testada; prazo de retenção informado na política
      de privacidade (`docs/privacy.md` §5).
- [ ] Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` na Vercel (Production).
- [ ] Verificação pós-deploy (§5) feita.
- [ ] Política de privacidade e termos publicados antes de convidar outras pessoas.
