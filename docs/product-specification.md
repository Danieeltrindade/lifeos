# LifeOS — Especificação do produto

> Versão 0.1 · Fase 1 (fundação) · Documento vivo: atualize a cada fase.

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

| ID    | Caso de uso                                            | Módulos              | Fase                       |
| ----- | ------------------------------------------------------ | -------------------- | -------------------------- |
| UC-01 | Ver o resumo do dia ao abrir o app                     | Dashboard            | 1 (estrutura) / 2+ (dados) |
| UC-02 | Escolher tema claro, escuro ou do sistema              | Configurações        | 1 ✅                       |
| UC-03 | Criar conta, entrar e sair                             | Autenticação         | 2                          |
| UC-04 | Cadastrar matérias e tópicos                           | Estudos              | 2                          |
| UC-05 | Iniciar, pausar, retomar e encerrar uma sessão de foco | Estudos, Atividades  | 2                          |
| UC-06 | Lançar uma atividade manualmente                       | Atividades           | 2                          |
| UC-07 | Criar tarefas com prazo, prioridade e subtarefas       | Tarefas              | 3                          |
| UC-08 | Agrupar tarefas em projetos                            | Projetos             | 3                          |
| UC-09 | Planejar blocos de tempo na semana                     | Calendário           | 4                          |
| UC-10 | Comparar planejado × realizado                         | Calendário, Análises | 4 / 6                      |
| UC-11 | Definir metas e acompanhar progresso                   | Metas                | 5                          |
| UC-12 | Marcar hábitos e ver consistência                      | Hábitos              | 5                          |
| UC-13 | Escrever no diário                                     | Diário               | 5                          |
| UC-14 | Revisar tópicos em intervalos espaçados                | Estudos              | 5                          |
| UC-15 | Consultar relatórios por período                       | Análises             | 6                          |
| UC-16 | Receber sugestões justificadas pelo histórico          | Recomendações        | 7                          |

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
2. **Sessão de foco** (Fase 2): Dashboard → "Sessão de foco" → escolher matéria/tópico → cronômetro → pausar/retomar → encerrar → sessão gravada como Atividade → aparece em "Atividades recentes" e no tempo de estudo.
3. **Planejamento semanal** (Fase 4): Calendário → criar blocos (vinculados a tarefas/matérias) → durante a semana, registros reais preenchem o "realizado" → Análises compara.
4. **Encerramento do dia** (Fase 5): Diário → humor/energia → reflexão → revisar pendências.
5. **Navegação estrutural**: sidebar (≥ 1024 px) com grupos Planejar/Executar/Registrar/Avaliar; em telas menores, barra inferior com 4 atalhos + "Mais", que abre a gaveta com todos os módulos.

## 6. Entidades conceituais e relacionamentos

Resumo (detalhes em [data-model.md](./data-model.md)):

- **Usuário/Perfil** possui todas as demais entidades (isolamento por `user_id`).
- **Matéria** 1—N **Tópico**; **Tópico** 1—N **Revisão**.
- **Sessão de foco** N—1 Matéria (opcional Tópico), 1—N **Pausa**; ao encerrar gera 1 **Atividade**.
- **Atividade** (registro de tempo real) pode referenciar Sessão, Tarefa, Projeto ou Matéria.
- **Projeto** 1—N **Tarefa**; **Tarefa** 1—N **Subtarefa** (auto-relacionamento).
- **Bloco planejado** (calendário) pode referenciar Tarefa ou Matéria.
- **Meta** 0—N fontes de progresso (Matéria, Hábito, Projeto) ou progresso manual.
- **Hábito** 1—N **Marcação de hábito**.
- **Entrada de diário** 1 por usuário por dia.
- **Recomendação** guarda a regra que a gerou e as evidências.

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
| Uso offline / conexão instável                          | Médio                              | Fase 2: fila local mínima para o cronômetro; avaliar ao final da Fase 3                               |
| Escopo excessivo (12 módulos)                           | Alto para o TCC                    | Roadmap por fases com critérios de saída; módulos introdutórios honestos                              |
| Biblioteca de calendário inadequada/licença             | Médio                              | Avaliação registrada em ADR-008 antes da Fase 4                                                       |
| Métricas enganosas                                      | Alto (princípio do produto)        | RN-02/03/15, testes que verificam rótulos de origem                                                   |
| Dependências muito recentes (React Router 8, Vitest 5)  | Baixo/médio                        | Versões estáveis já adotadas pelo ecossistema; atualização planejada                                  |

## 9. Roadmap e critérios de conclusão por fase

| Fase                                 | Entrega                                                                                                  | Critério de saída (verificável)                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **1 — Fundação**                     | Arquitetura, design system, temas, layout responsivo, rotas, dashboard com estados, documentação, testes | Ver §10                                                                                                               |
| 2 — Backend e núcleo de registro     | Supabase (auth, perfis, RLS), Estudos (matérias, tópicos, sessões, pausas), Atividades                   | Testes de RLS passando; sessão sobrevive a recarregar a página; duração líquida testada; dashboard mostra dados reais |
| 3 — Tarefas e projetos               | CRUD, subtarefas, filtros, progresso derivado                                                            | RN-09 testada; formulários validados com Zod nos dois lados                                                           |
| 4 — Calendário                       | Blocos planejados, arrastar/redimensionar, planejado × realizado                                         | RN-02 visível e testada; uso por teclado e no celular                                                                 |
| 5 — Metas, hábitos, diário, revisões | Módulos de acompanhamento                                                                                | RN-10/11/12 testadas                                                                                                  |
| 6 — Análises                         | Relatórios e gráficos (Recharts) com tabela acessível                                                    | Valores conferidos contra consultas SQL de referência                                                                 |
| 7 — Recomendações                    | Regras explicáveis                                                                                       | RN-14; cada sugestão referencia evidências                                                                            |
| 8 — Qualidade                        | Playwright E2E, auditoria de acessibilidade, desempenho                                                  | Fluxos principais cobertos por E2E                                                                                    |

## 10. Critérios de aceitação da Fase 1

- [ ] `npm install`, `npm run dev` executam o projeto localmente.
- [ ] Todas as rotas do registro de módulos navegam (sidebar, barra inferior, gaveta) e há 404.
- [ ] Temas claro, escuro e sistema funcionam, persistem e não piscam ao carregar.
- [ ] Layout sem overflow horizontal em 360, 390, 768, 1024, 1280 e 1440 px.
- [ ] Dashboard apresenta estados de carregamento, erro (com nova tentativa), vazio e com dados; dados de demonstração identificados.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` sem erros.
- [ ] Documentos em `docs/` descrevem produto, arquitetura, design system, dados e decisões.

O status de cada item na entrega desta fase está no relatório final e no README.

## 11. Decisões adiadas

- Provedores de login (e-mail/senha, magic link, Google) — Fase 2.
- Estratégia offline completa (PWA, sincronização) — avaliar após Fase 3.
- Biblioteca de calendário — ADR-008, decidir no início da Fase 4.
- Algoritmo de revisão espaçada (SM-2, FSRS ou intervalos fixos) — Fase 5.
- Modelo de recomendações além de regras — Fase 7, condicionado a dados suficientes.
- Internacionalização (hoje somente pt-BR, textos já centralizados por módulo).
- Notificações (push/e-mail).
