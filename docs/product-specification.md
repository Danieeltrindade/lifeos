# LifeOS — Especificação do produto

> Versão 0.2 · Fase 2 (backend, autenticação e segurança) · Documento vivo: atualize a cada fase.

## 1. Problema

Quem estuda e trabalha ao mesmo tempo costuma distribuir a própria rotina entre várias ferramentas: um app de tarefas, um calendário, um cronômetro de foco, planilhas de horas de estudo, um caderno de anotações. Cada ferramenta guarda um pedaço da verdade, e nenhuma responde às perguntas que importam:

- **O que eu planejei e o que realmente aconteceu?**
- Quanto tempo de fato dediquei a cada matéria, projeto ou área da vida?
- Estou avançando nas minhas metas, ou só me sentindo ocupado?
- O que devo revisar, e quando?

O LifeOS unifica **planejar → executar → registrar → avaliar** em um único sistema, com uma regra central: **estimativas e planos nunca são confundidos com fatos registrados**.

## 2. Perfil de usuário inicial

- **Primária:** estudante universitário de Ciência da Computação (o próprio autor), que concilia disciplinas, TCC, projetos pessoais e hábitos. Usa computador e celular ao longo do dia.
- **Necessidades:** registrar sessões de estudo com tempo confiável, organizar tarefas com prazos, planejar a semana, revisar conteúdos no momento certo e enxergar a própria evolução.
- **Restrições:** tempo escasso (o sistema deve exigir pouca digitação), uso frequente no celular, sensibilidade a dados pessoais (diário, humor).
- **Futuro:** múltiplas contas independentes, com isolamento total entre usuários desde a primeira versão do banco.

## 3. Principais casos de uso

| ID    | Caso de uso                                            | Módulos              | Fase               |
| ----- | ------------------------------------------------------ | -------------------- | ------------------ |
| UC-01 | Ver o resumo do dia ao abrir o app                     | Dashboard            | 2 ✅ (dados reais) |
| UC-02 | Escolher tema claro, escuro ou do sistema              | Configurações        | 1 ✅               |
| UC-03 | Criar conta, entrar e sair                             | Autenticação         | 2 ✅               |
| UC-04 | Cadastrar matérias e tópicos                           | Estudos              | 3                  |
| UC-05 | Iniciar, pausar, retomar e encerrar uma sessão de foco | Estudos, Atividades  | 3                  |
| UC-06 | Lançar uma atividade manualmente                       | Atividades           | 3                  |
| UC-07 | Criar tarefas com prazo, prioridade e subtarefas       | Tarefas              | 4                  |
| UC-08 | Agrupar tarefas em projetos                            | Projetos             | 4                  |
| UC-09 | Planejar blocos de tempo na semana                     | Calendário           | 5                  |
| UC-10 | Comparar planejado × realizado                         | Calendário, Análises | 5 / 7              |
| UC-11 | Definir metas e acompanhar progresso                   | Metas                | 6                  |
| UC-12 | Marcar hábitos e ver consistência                      | Hábitos              | 6                  |
| UC-13 | Escrever no diário                                     | Diário               | 6                  |
| UC-14 | Revisar tópicos em intervalos espaçados                | Estudos              | 6                  |
| UC-15 | Consultar relatórios por período                       | Análises             | 7                  |
| UC-16 | Receber sugestões justificadas pelo histórico          | Recomendações        | 8                  |

## 4. Módulos e limites de responsabilidade

O ciclo do produto organiza a navegação:

| Grupo       | Módulo        | Responsável por                                           | **Não** é responsável por                 |
| ----------- | ------------- | --------------------------------------------------------- | ----------------------------------------- |
| Visão geral | Dashboard     | Agregar leituras de outros módulos para o dia atual       | Criar ou editar dados (apenas atalhos)    |
| Planejar    | Calendário    | Blocos de tempo _planejados_                              | Registrar o que aconteceu                 |
| Planejar    | Tarefas       | Itens acionáveis, status, prazo, prioridade, estimativa   | Medir tempo gasto (vem de Atividades)     |
| Planejar    | Projetos      | Agrupar tarefas em torno de um resultado                  | Progresso manual (é derivado das tarefas) |
| Planejar    | Metas         | Alvos mensuráveis e prazos                                | Inventar progresso sem fonte              |
| Executar    | Estudos       | Matérias, tópicos, sessões de foco, cronômetro, revisões  | Calendário genérico                       |
| Executar    | Hábitos       | Definição de recorrência e marcações                      | Metas de longo prazo                      |
| Registrar   | Atividades    | **Fonte única do tempo realizado** (cronômetro ou manual) | Planejamento                              |
| Registrar   | Diário        | Reflexão diária, humor e energia                          | Métricas de produtividade                 |
| Avaliar     | Análises      | Relatórios somente leitura sobre registros                | Alterar dados                             |
| Avaliar     | Recomendações | Sugestões explicáveis, dispensáveis                       | Ações automáticas sem confirmação         |
| Sistema     | Configurações | Preferências, perfil, conta, exportação                   | —                                         |

## 5. Fluxos principais de navegação

1. **Abertura do app** → Dashboard (agenda do dia, prioridades, estudos, revisões, registros recentes, recomendações, ações rápidas).
2. **Sessão de foco** (Fase 3; funções do banco prontas na Fase 2): Dashboard → "Sessão de foco" → escolher matéria/tópico → cronômetro → pausar/retomar → encerrar → sessão gravada como Atividade → aparece em "Atividades recentes" e no tempo de estudo.
3. **Planejamento semanal** (Fase 5): Calendário → criar blocos (vinculados a tarefas/matérias) → durante a semana, registros reais preenchem o "realizado" → Análises compara.
4. **Encerramento do dia** (Fase 6): Diário → humor/energia → reflexão → revisar pendências.
5. **Navegação estrutural**: sidebar (≥ 1024 px) com grupos Planejar/Executar/Registrar/Avaliar; em telas menores, barra inferior com 4 atalhos + "Mais", que abre a gaveta com todos os módulos.

## 6. Entidades conceituais e relacionamentos

Resumo (detalhes em [data-model.md](./data-model.md)):

- **Usuário/Perfil** possui todas as demais entidades (isolamento por `user_id`).
- **Matéria** 1—N **Tópico**; **Tópico** 1—N **Revisão**.
- **Sessão de foco** N—1 Matéria (opcional Tópico), 1—N **Pausa**; ao encerrar gera 1 **Atividade**.
- **Atividade** (registro de tempo real) pode referenciar Sessão, Tarefa, Projeto ou Matéria.
- **Projeto** 1—N **Tarefa**; **Tarefa** 1—N **Subtarefa** (auto-relacionamento).
- **Evento do calendário** (bloco planejado ou compromisso; pode ser recorrente) pode referenciar Tarefa, Matéria ou Hábito.
- **Meta** com progresso manual ou derivado de UMA fonte (Matéria, Projeto, Categoria de atividade ou Hábito); 1—N **Marcos**.
- **Hábito** 1—N **Marcação de hábito**.
- **Entrada de diário** 1 por usuário por dia.
- **Recomendação** guarda a regra que a gerou, as evidências e a decisão do usuário.
- **Lembrete** aponta para no máximo um alvo (Tarefa, Evento, Hábito ou Revisão).

## 7. Regras de negócio conhecidas

| ID    | Regra                                                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN-01 | Todo dado pertence a exatamente um usuário; nenhum usuário lê ou escreve dados de outro (garantido por RLS no banco).                                                  |
| RN-02 | **Planejado ≠ realizado.** Blocos de calendário e estimativas de tarefa nunca são somados como tempo realizado.                                                        |
| RN-03 | Tempo realizado vem exclusivamente de Atividades (geradas por cronômetro ou lançadas manualmente). A origem é sempre visível.                                          |
| RN-04 | Duração líquida de uma sessão = (fim − início) − soma das pausas. Não pode ser negativa.                                                                               |
| RN-05 | Uma sessão tem no máximo uma pausa aberta por vez; não é possível encerrar com pausa aberta sem fechá-la no mesmo instante.                                            |
| RN-06 | Cada usuário tem no máximo **uma** sessão de foco ativa por vez.                                                                                                       |
| RN-07 | O cronômetro é calculado a partir de timestamps persistidos, nunca de contadores na memória (resiste a recarregar a página, trocar de aba e suspensão do dispositivo). |
| RN-08 | Atividades do mesmo usuário não se sobrepõem no tempo (validado no servidor; o usuário é avisado e decide).                                                            |
| RN-09 | Progresso de projeto = tarefas concluídas / tarefas não canceladas.                                                                                                    |
| RN-10 | Progresso de meta automática é derivado; progresso manual é marcado como tal.                                                                                          |
| RN-11 | Sequência de hábito é calculada a partir das marcações; não há campo editável de "sequência".                                                                          |
| RN-12 | Uma entrada de diário por usuário por dia local.                                                                                                                       |
| RN-13 | Datas armazenadas em UTC; "dia" é definido pelo fuso do perfil do usuário.                                                                                             |
| RN-14 | Recomendações exigem justificativa legível e um mínimo de histórico; sem dados suficientes, nenhuma é exibida.                                                         |
| RN-15 | Dados de demonstração são sempre marcados (`origin: 'demo'`) e nunca persistidos como dados do usuário.                                                                |

## 8. Riscos técnicos

| Risco                                                   | Impacto                            | Mitigação                                                                                             |
| ------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Cronômetro impreciso (abas em segundo plano, suspensão) | Alto: corrompe a principal métrica | RN-07: timestamps no servidor; UI apenas exibe `now − início − pausas`                                |
| Falha de isolamento entre contas                        | Crítico                            | RLS em todas as tabelas, testes de RLS (pgTAP) em `supabase/tests`, nada de `service_role` no cliente |
| Fusos horários e horário de verão                       | Médio                              | UTC no banco, fuso no perfil, testes com datas de fronteira                                           |
| Uso offline / conexão instável                          | Médio                              | Cronômetro baseado em instantes do servidor (RPCs prontas); fila local mínima avaliada na Fase 3      |
| Limite de e-mails do servidor padrão do Supabase        | Médio (bloqueia cadastros)         | SMTP próprio antes de usuários externos (`docs/supabase-setup.md` §10)                                |
| Divergência entre esquema e interface                   | Médio                              | Tipos gerados do banco + validação Zod das respostas + teste de contrato com JSON real                |
| Escopo excessivo (12 módulos)                           | Alto para o TCC                    | Roadmap por fases com critérios de saída; módulos introdutórios honestos                              |
| Biblioteca de calendário inadequada/licença             | Médio                              | Avaliação registrada em ADR-008 antes da Fase 4                                                       |
| Métricas enganosas                                      | Alto (princípio do produto)        | RN-02/03/15, testes que verificam rótulos de origem                                                   |
| Dependências muito recentes (React Router 8, Vitest 5)  | Baixo/médio                        | Versões estáveis já adotadas pelo ecossistema; atualização planejada                                  |

## 9. Roadmap e critérios de conclusão por fase

| Fase                                               | Entrega                                                                                                                                                                                                                                   | Critério de saída (verificável)                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **1 — Fundação** ✅                                | Arquitetura, design system, temas, layout responsivo, rotas, dashboard com estados, documentação                                                                                                                                          | Ver §10                                                                                         |
| **2 — Backend, autenticação e segurança** ✅       | Modelo relacional completo, migrations, RLS, Supabase Auth, perfil, camada de dados, dashboard real                                                                                                                                       | Ver §11                                                                                         |
| **3 — Módulos centrais** ✅                        | Tarefas (lista/Kanban), projetos, estudos (matérias, tópicos, cronômetro, reflexão, revisões), metas, hábitos, atividades, diário, calendário e dashboard integrado                                                                       | Ver §13                                                                                         |
| **4 — Integração, estatísticas e planejamento** ✅ | Integração entre módulos, calendário completo (categorias, conflitos, edição de ocorrência/série), estatísticas por período, análises (Recharts), recomendações por regras, planejamento adaptativo, revisão semanal, exportação CSV/JSON | Ver §14                                                                                         |
| ~~5–8~~                                            | Absorvidas pela Fase 4 (análises e recomendações entregues junto com a integração)                                                                                                                                                        | —                                                                                               |
| 9 — Qualidade e produção                           | Playwright E2E, auditoria de acessibilidade, desempenho, SMTP, MFA, CI                                                                                                                                                                    | Fluxos principais cobertos por E2E; checklist de produção de `docs/supabase-setup.md` concluído |

## 10. Critérios de aceitação da Fase 1

- [ ] `npm install`, `npm run dev` executam o projeto localmente.
- [ ] Todas as rotas do registro de módulos navegam (sidebar, barra inferior, gaveta) e há 404.
- [ ] Temas claro, escuro e sistema funcionam, persistem e não piscam ao carregar.
- [ ] Layout sem overflow horizontal em 360, 390, 768, 1024, 1280 e 1440 px.
- [ ] Dashboard apresenta estados de carregamento, erro (com nova tentativa), vazio e com dados; dados de demonstração identificados.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` sem erros.
- [ ] Documentos em `docs/` descrevem produto, arquitetura, design system, dados e decisões.

O status de cada item na entrega desta fase está no relatório final e no README.

## 11. Critérios de aceitação da Fase 2

| Critério                                                                                                       | Situação                                   | Evidência                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticação real integrada (cadastro, login, logout, recuperação, confirmação, sessão persistente, expiração) | ✅ código · ⏳ verificação no projeto real | `services/auth`, `modules/auth`; `auth-flows.test.tsx`; falta executar no projeto Supabase do autor (`docs/supabase-setup.md` §7)                                                                                                                                                                                               |
| Esquema versionado e reproduzível em banco limpo                                                               | ✅                                         | 7 migrations; `npm run db:test:local` recria o banco do zero                                                                                                                                                                                                                                                                    |
| A aplicação lê e grava dados autenticados                                                                      | ✅ código · ⏳ projeto real                | Dashboard (`dashboard_summary`), perfil (leitura/gravação), exportação, exclusão                                                                                                                                                                                                                                                |
| Isolamento entre usuários implementado e validado                                                              | ✅ banco · ⏳ API real                     | 263 asserções pgTAP (+ testes de mutação); `npm run test:integration` aguarda o projeto e duas contas de teste                                                                                                                                                                                                                  |
| Nenhum segredo no frontend                                                                                     | ✅                                         | Só URL + publishable; `config.test.ts` recusa `service_role`/`secret`                                                                                                                                                                                                                                                           |
| `.env.example` e documentação corretos                                                                         | ✅                                         | `.env.example`, `docs/supabase-setup.md`                                                                                                                                                                                                                                                                                        |
| Build e testes                                                                                                 | ✅ Linux e Windows · ⏳ projeto real       | typecheck, lint, format, Vitest e build; pgTAP 486 asserções com a sessão em 3 fusos; falta executar no projeto Supabase do autor                                                                                                                                                                                               |
| Auditoria da Fase 4 (antes de concluir)                                                                        | ✅                                         | Corrigidos: listas truncadas em 1000 linhas pelo servidor (ADR-037); ausência desenhada como zero em gráficos/cartões e evolução sem granularidade mensal (ADR-038); metas e hábitos sem comparação com o período anterior; planejador com mensagem contraditória sem disponibilidade; teste pgTAP dependente do fuso da sessão |
| Módulos seguintes reutilizam o mesmo modelo                                                                    | ✅                                         | Todas as entidades das Fases 3–8 já modeladas, com RLS e testes                                                                                                                                                                                                                                                                 |

## 12. Decisões adiadas

- Login social e magic link — quando houver demanda (e-mail e senha implementados na Fase 2, ADR-012).
- Estratégia offline completa (PWA, sincronização) — avaliar após Fase 3.
- Recomendações por modelos estatísticos ou IA — **fora do escopo** por decisão do autor; as recomendações são regras explícitas (ADR-034).
- Internacionalização (hoje somente pt-BR, textos já centralizados por módulo).
- Entrega de lembretes e notificações (push/e-mail) — o modelo existe (`reminders`); falta o agendador. A interface diz explicitamente que não há notificações.
- Tabela de livros/leitura — ADR-017.

## 13. Critérios de aceitação da Fase 3

| Critério                                | Situação                             | Evidência                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build e testes                          | ✅ Linux e Windows · ⏳ projeto real | typecheck, lint, format, Vitest e build; pgTAP 486 asserções com a sessão em 3 fusos; falta executar no projeto Supabase do autor                                              |
| Todas as rotas verificadas              | ✅                                   | `navigation.test.tsx` (toda rota do registro e todo link interno resolvem) + verificação visual de 14 telas em 390/1280 px, claro/escuro, sem overflow nem erros de JavaScript |
| Formulários persistem                   | ✅ código · ⏳ projeto real          | Testes de fluxo gravam no PostgREST falso; regras do banco nos testes pgTAP; falta rodar no projeto Supabase do autor                                                          |
| Layout responsivo                       | ✅                                   | Sem overflow horizontal em 360–1280 px; Kanban e calendário rolam dentro do próprio contêiner                                                                                  |
| Modelo de dados documentado             | ✅                                   | `docs/data-model.md` §9                                                                                                                                                        |
| Limitações reais listadas               | ✅                                   | Relatório final e §12                                                                                                                                                          |
| Nada declarado pronto só por ser visual | ✅                                   | Na entrega da Fase 3, Análises e Recomendações ficaram "em desenvolvimento" (entregues na Fase 4); notificações não existem e a interface diz isso                             |

## 14. Critérios de aceitação da Fase 4

| Critério                                          | Situação                             | Evidência                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integrações auditadas e corrigidas                | ✅                                   | tarefa ↔ meta (`tasks.goal_id`, “só vinculadas”), categoria em eventos, tempo realizado por tarefa, invalidação do domínio `stats`                                                                                                   |
| Calendário completo                               | ✅                                   | categorias e cores, filtros, conflitos (aviso + ⚠), editar só esta / esta e as seguintes / remover a partir desta, `?data=`; testes de recorrência e fuso                                                                            |
| Estimado × planejado × realizado por tarefa       | ✅                                   | `TaskTimeSection` + `time-plan.ts`; nunca conclui automaticamente                                                                                                                                                                    |
| Estatísticas com definição matemática documentada | ✅                                   | `docs/metrics.md`; funções `stats_*` + `analytics/logic`; testes unitários e pgTAP                                                                                                                                                   |
| Comparação de períodos sem percentuais enganosos  | ✅                                   | `periods.ts`, `metrics.ts` (anterior 0 → “sem base”)                                                                                                                                                                                 |
| Visualizações acessíveis e responsivas            | ✅                                   | Recharts + tabela equivalente; verificação visual com **dados reais calculados pelo PostgreSQL** (proxy local das funções `stats_*` sob RLS): 10 telas × 360/768/1280 px × claro/escuro, sem overflow, erros de JS ou falhas de rede |
| Recomendações por regras, com controle do usuário | ✅                                   | 11 regras (`docs/recommendations.md`); aceitar/adiar/rejeitar/resolver/histórico; deduplicação e espera no banco                                                                                                                     |
| Planejamento adaptativo explicável                | ✅                                   | `/calendario/planejar`: disponibilidade, preferências, motivos, editar/desmarcar/descartar/criar                                                                                                                                     |
| Revisão semanal                                   | ✅                                   | `/analises/semana`: planejado × realizado, tarefas, estudo, metas, hábitos, conflitos, recomendações, anotações e prioridades                                                                                                        |
| Exportação                                        | ✅                                   | JSON v3, CSV por tabela, resumo semanal CSV/JSON                                                                                                                                                                                     |
| Sem IA/LLM nem dependências para isso             | ✅                                   | Única dependência nova: `recharts`                                                                                                                                                                                                   |
| Build e testes                                    | ✅ Linux e Windows · ⏳ projeto real | typecheck, lint, format, Vitest e build; pgTAP 486 asserções com a sessão em 3 fusos; falta executar no projeto Supabase do autor                                                                                                    |

## 15. Critérios de aceitação da Fase 5 (auditoria final e publicação)

| Critério                                         | Situação                           | Evidência                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fluxos centrais verificados com dados reais      | ✅ em Supabase local · ⏳ produção | `e2e/journey.spec.ts`: 12 passos do brief contra Auth + PostgREST + PostgreSQL reais, build de produção, cadastro confirmado por e-mail                                                         |
| Problemas críticos e altos resolvidos            | ✅                                 | relatório da Fase 5; ADR-040 a 044; migration `20261023120000_phase5_integrity.sql`                                                                                                             |
| Segurança verificada                             | ✅ local · ⏳ painel do projeto    | pgTAP (RLS de todas as tabelas, 2 funções DEFINER), varredura de isolamento pela API com duas contas, isolamento pela interface, CSP testada, nenhum segredo no pacote, `npm audit` sem alertas |
| Integridade e consistência                       | ✅                                 | pgTAP `07` (exclusões sem órfãos), `consistency.integration.test.ts`, `e2e/resilience.spec.ts` (sem duplicatas)                                                                                 |
| Acessibilidade e responsividade                  | ✅ (Chromium)                      | axe WCAG 2.1 AA em 25 telas, claro e escuro; sem rolagem horizontal em 360–1440 px; teclado e foco                                                                                              |
| Contas novas sem dados misturados                | ✅                                 | jornada passo 1; dados de demonstração só existem em `npm run dev` e não entram no pacote de produção                                                                                           |
| Exportação e exclusão documentadas e funcionando | ✅                                 | `docs/privacy.md` §5; JSON v3 cobre todas as tabelas                                                                                                                                            |
| Sem IA/LLM                                       | ✅                                 | nenhuma dependência ou chamada; recomendações por regras (`docs/recommendations.md`)                                                                                                            |
| Deploy descrito                                  | ✅ preparado · ⏳ execução         | `vercel.json`, `docs/deployment.md` (passo a passo e checklist)                                                                                                                                 |
| Documentação                                     | ✅                                 | README, `docs/testing.md`, `docs/deployment.md`, `docs/data-model.md` §11, `docs/metrics.md` §11–12                                                                                             |
