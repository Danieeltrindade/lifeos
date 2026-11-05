# LifeOS

Sistema pessoal para **planejar, executar, registrar e avaliar** a própria rotina: estudos,
tarefas, projetos, tempo, metas, hábitos e notas. O que foi planejado e o que realmente aconteceu
ficam sempre separados, e cada número exibido vem dos registros do usuário, com a fórmula
documentada.

> **Estado: Fase 5 concluída — auditoria final, testes, segurança e preparação para publicação.**
> Verificado de ponta a ponta contra um Supabase local (Auth, API e banco reais). Falta publicar no
> projeto Supabase e na Vercel do autor — passo a passo em [`docs/deployment.md`](docs/deployment.md).

## Funcionalidades

| Módulo                  | O que faz                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard               | Agenda do dia, estudos, hábitos, tarefas prioritárias, revisões, metas, projetos, atividades recentes e recomendações; conta nova recebe um guia inicial |
| Estudos                 | Matérias e tópicos (subtópicos, domínio, anotações), cronômetro com pausas que sobrevive à recarga, sessões manuais, reflexão pós-sessão                 |
| Revisões                | Repetição espaçada por tópico, com notas, adiamento e histórico                                                                                          |
| Tarefas e projetos      | Lista e Kanban, subtarefas, dependências, prioridades, prazos, estimado × planejado × realizado; projetos com marcos e progresso                         |
| Calendário              | Mês/semana/dia, eventos recorrentes (editar só esta ou esta e as seguintes), conflitos, prazos e revisões na agenda, tempo realizado                     |
| Metas                   | Manual, por tempo, sessões, questões, páginas, tarefas concluídas ou hábitos; ciclos diários/semanais/mensais; editar não reescreve o histórico          |
| Hábitos                 | Dias fixos, X vezes por semana ou diário; sequências e consistência                                                                                      |
| Atividades e notas      | Registro de tempo por categoria (estudo, leitura, exercício…); notas em categorias e subcategorias, com editor de texto, imagens e links de vídeo        |
| Análises                | Estudos, tarefas, metas/hábitos e atividades por dia/semana/mês/trimestre/ano/personalizado, com comparação ao período anterior e tabela de cada gráfico |
| Revisão semanal         | Planejado × realizado, tarefas, estudo, metas, hábitos, conflitos, anotações e prioridades da semana seguinte                                            |
| Recomendações           | 11 regras explícitas (sem IA), com motivo e evidências; aceitar, adiar, rejeitar, resolver e histórico                                                   |
| Planejamento adaptativo | Sugere blocos a partir da disponibilidade, compromissos, prazos e estimativas; explica cada escolha e só grava depois de confirmar                       |
| Configurações           | Perfil, fuso, início da semana, tema claro/escuro, exportação (JSON e CSV), troca de senha e exclusão da conta                                           |

Não há inteligência artificial, chatbot nem chamadas a modelos de linguagem: todas as
recomendações vêm de regras documentadas em [`docs/recommendations.md`](docs/recommendations.md).

## Tecnologias

- **Interface:** React 19, TypeScript (estrito), Vite 8, Tailwind CSS 4, React Router 7.
- **Dados:** TanStack Query 5, React Hook Form + Zod 4, supabase-js 2.
- **Componentes:** FullCalendar 6 (MIT), Recharts 3, dnd-kit, lucide-react.
- **Backend:** Supabase — PostgreSQL com Row Level Security, Auth (e-mail e senha, PKCE), API REST.
- **Testes:** Vitest + Testing Library, pgTAP, Playwright + axe-core.
- **Hospedagem prevista:** Vercel (estático) + Supabase.

## Estrutura

```
src/app          rotas (fonte única em modules.ts), guardas, provedores, página de erro
src/components   ui/ (componentes base) e layout/ (shell, navegação, conta)
src/modules      dashboard, tasks, projects, studies, calendar, planning, goals, habits,
                 activities, notes, analytics, recommendations, settings, auth
                 (cada um com data/, logic/ e components/)
src/services     supabase/ (cliente, tipos, erros, paginação), auth/, profile/, data/
src/lib          funções puras (datas e fusos, exportação, cache e escritas, tema)
supabase/        migrations/ (18), tests/database (pgTAP), tests/local, stack/ (pilha de teste)
e2e/             testes ponta a ponta (Playwright)
docs/            especificação, arquitetura, dados, métricas, recomendações, testes, deploy…
```

## Instalação e execução local

Requisitos: **Node.js 22.12+** e npm 10+; um projeto Supabase (o plano gratuito basta).

```bash
npm ci
cp .env.example .env.local     # Windows: copy .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                    # http://localhost:5173
```

### Variáveis de ambiente

| Variável                        | Onde obter                                               | Pública? |
| ------------------------------- | -------------------------------------------------------- | -------- |
| `VITE_SUPABASE_URL`             | Supabase → Project Settings → Data API → Project URL     | sim      |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key | sim      |

Só essas duas vão para o navegador. A chave **secret**/`service_role` e a senha do banco nunca
entram no projeto — o app se recusa a iniciar se receber uma chave secreta. Sem `.env.local` válido,
o app mostra "Configuração necessária" em vez de fingir funcionar. Variáveis só de teste estão em
`.env.example` e em [`docs/testing.md`](docs/testing.md).

### Supabase e migrations

Passo a passo em [`docs/supabase-setup.md`](docs/supabase-setup.md):

```bash
npx supabase login
npm run db:link -- --project-ref <ref-do-projeto>
npm run db:push                # aplica as 15 migrations em ordem
npm run db:types               # regenera os tipos do banco após migrations novas
```

Depois configure as URLs de redirecionamento da autenticação, a confirmação de e-mail e mantenha
**Max rows ≥ 1000**. Mudanças no banco sempre em uma migration **nova**.

## Scripts

| Comando                          | O que faz                                                                 |
| -------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                    | Servidor de desenvolvimento                                               |
| `npm run build`                  | Checagem de tipos + build de produção em `dist/`                          |
| `npm run preview`                | Serve o build com os mesmos cabeçalhos de segurança do deploy             |
| `npm run check`                  | typecheck, lint, formatação, testes de unidade e build                    |
| `npm test`                       | Vitest + Testing Library                                                  |
| `npm run db:test:local`          | Banco limpo + migrations + pgTAP (PostgreSQL local, sem Docker)           |
| `npm run stack:start` / `stop`   | Supabase local de teste sem Docker (Linux): Auth + PostgREST + PostgreSQL |
| `npm run test:integration:stack` | Integração (RLS, isolamento, consistência) contra a pilha local           |
| `npm run test:e2e`               | Playwright: jornada completa, rede instável, isolamento, acessibilidade   |
| `npm run db:link` / `db:push`    | Vincula o projeto e aplica migrations pendentes (Supabase CLI)            |

## Testes

Resumo; tudo em [`docs/testing.md`](docs/testing.md).

| Camada          | Resultado na entrega da Fase 5                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Unidade e telas | 362 testes (Linux e Windows)                                                                               |
| Banco (pgTAP)   | 564 asserções em banco limpo                                                                               |
| Integração      | 45 testes contra Auth/PostgREST/PostgreSQL reais, duas contas                                              |
| Ponta a ponta   | 25 testes no build de produção sob a CSP real: jornada de 12 passos, axe em 25 telas, 6 larguras × 2 temas |
| Dependências    | `npm audit`: 0 vulnerabilidades                                                                            |

O Supabase de **produção** não é tocado por nenhum teste; o checklist dele está no guia de deploy.

## Build e deploy

```bash
npm run build                  # gera dist/
```

GitHub → Supabase → Vercel, com `vercel.json` (rotas da SPA, cache e cabeçalhos de segurança):
[`docs/deployment.md`](docs/deployment.md).

## Limitações conhecidas

- **Projeto Supabase real ainda não verificado**: tudo foi testado num Supabase local com os
  binários oficiais; configurações do painel (SMTP, URLs, Max rows) dependem do autor.
- **Sem notificações** (e-mail/push): o app avisa só quando está aberto (dashboard, calendário,
  recomendações). A tabela `reminders` existe no banco, mas não há envio de lembretes.
- **Recorrência expandida no navegador**: eventos recorrentes são calculados na interface para a
  janela visível; regras muito longas (anos) não são materializadas no banco.
- **Pausas de hábito sem histórico**: pausar um hábito não guarda o intervalo da pausa.
- **Planejador heurístico**: sugere um plano razoável, não o ótimo, e diz isso na tela.
- **Testes automáticos só no Chromium**; leitores de tela reais não foram testados.
- **Uso pessoal**: antes de abrir para outras pessoas, publicar política de privacidade, configurar
  SMTP próprio e definir retenção de backups ([`docs/privacy.md`](docs/privacy.md)).

## Documentação

- [Especificação do produto](docs/product-specification.md) ·
  [Arquitetura](docs/architecture.md) · [Modelo de dados](docs/data-model.md)
- [Métricas e estatísticas](docs/metrics.md) · [Recomendações e planejamento](docs/recommendations.md)
- [Testes](docs/testing.md) · [Publicação](docs/deployment.md) ·
  [Configurando o Supabase](docs/supabase-setup.md)
- [Privacidade, exportação e exclusão](docs/privacy.md) · [Design system](docs/design-system.md) ·
  [Decisões (ADRs)](docs/decisions.md)
