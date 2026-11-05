# Métricas e estatísticas

Definição matemática de cada número exibido nas **Análises**, na **Revisão semanal**, no
detalhe da tarefa e usado pelas **Recomendações**. Nenhuma métrica é estimada ou inventada:
todas vêm de registros do usuário, e quando a base é vazia o valor é “—” (nunca 0 % ou ∞ %).

Onde está o cálculo:

| Camada                                                                                                                                        | O que calcula                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Banco — `public.stats_study`, `stats_tasks`, `stats_activities`, `stats_goals`, `task_time_totals` (migration `20261022120100_analytics.sql`) | somas, contagens e recortes por dia local, sob RLS, sem trazer registros brutos ao navegador |
| `src/modules/analytics/logic/` (`periods.ts`, `metrics.ts`, `habit-stats.ts`, `goal-stats.ts`, `weekly.ts`)                                   | períodos, comparação, razões, médias, medianas, consistência, resumo semanal                 |
| `src/modules/tasks/logic/time-plan.ts`                                                                                                        | estimado × planejado × realizado de uma tarefa                                               |
| `src/modules/calendar/logic/conflicts.ts`, `agenda.ts`                                                                                        | conflitos e carga planejada por dia                                                          |

Nenhum cálculo fica dentro de componentes React; todos têm testes unitários (`*.test.ts`) e as
agregações do banco têm testes pgTAP (`supabase/tests/database/06_phase4_rules.test.sql`).

## 1. Convenções gerais

- **Dia** = dia de calendário no **fuso do perfil** (`profiles.timezone`), nunca o do navegador
  nem UTC. O banco converte o período `[from, to)` de datas locais em instantes com o mesmo fuso.
- **Intervalos** são semiabertos: `[início, fim)`. Uma atividade que termina às 10:00 não conta
  no minuto 10:00; um evento que termina às 10:00 não conflita com outro que começa às 10:00.
- **Tempo** = duração **líquida** em segundos (pausas de sessões de foco já descontadas na
  atividade gerada). Arredondamento só na exibição (minutos).
- **Recorte por dia**: tempo é dividido pelos dias em que aconteceu (uma sessão 23:30–00:30 dá
  30 min em cada dia). Uma pausa conta no dia em que ocorreu.
- **Contagens por início**: sessões, atividades (quantidade), tarefas criadas/concluídas/
  canceladas contam no dia do **instante do evento** (início, `created_at`, `completed_at`,
  `cancelled_at`).
- **Limite do período**: 1 a 731 dias (`private.require_stats_range`, erro 22023 fora disso).
- **Valores ausentes**: campo não informado (páginas, distância, estimativa, questões) não vira 0;
  é excluído da soma e informado à parte (“2 leituras sem páginas”). Na interface, ausência aparece
  como “—” ou como estado vazio explicado, nunca como 0: dias que ainda não aconteceram não entram nos
  gráficos (nem como barra zero, nem no tooltip — “sem dado”); “Questões” sem nenhuma informada é “—”;
  “realizado nos blocos vinculados” sem blocos é “—”; o gráfico de revisões por nota sem revisões dá
  lugar a um aviso; o gráfico estimado × realizado só desenha tarefas **com** tempo registrado (as
  demais ficam na tabela e são contadas na descrição).
- **Alterações retroativas e exclusões**: tudo é recalculado a cada leitura a partir dos
  registros atuais — corrigir uma sessão, editar uma atividade ou excluir um registro muda as
  estatísticas na hora (invalidação do domínio `stats`, ADR-024/031).

## 2. Períodos e comparação

| Nome                | Definição                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Período             | Dia, semana (início conforme o perfil), mês, trimestre, ano de calendário, ou personalizado (`de`/`até` inclusivos). Guardado na URL: `?periodo=&data=` ou `?periodo=custom&de=&ate=`                                                                                                                                                                                                                 |
| Período anterior    | O dia/semana/mês/trimestre/ano de calendário anterior (fevereiro tem 28/29 dias, não “30 dias”); personalizado: mesma duração imediatamente antes                                                                                                                                                                                                                                                     |
| Período incompleto  | Hoje ∈ período. A interface avisa “em andamento (N de M dias)”                                                                                                                                                                                                                                                                                                                                        |
| Comparação alinhada | Se o período atual está em andamento, compara com os **primeiros N dias** do anterior (N = dias transcorridos, limitado ao tamanho do anterior). Encerrado: anterior completo                                                                                                                                                                                                                         |
| Período futuro      | Sem comparação                                                                                                                                                                                                                                                                                                                                                                                        |
| Evolução (gráficos) | Granularidade pelo tamanho do período: até 62 dias → por dia; até 186 → por semana (início do perfil); acima → por mês. **Dias que ainda não aconteceram não entram** (não viram 0). Semana/mês com menos dias que um balde completo (borda do período ou em andamento) é marcado com `*` e a tabela mostra a cobertura (“parcial: 01/10–04/10, 4 de 7 dias”). Função: `analytics/logic/evolution.ts` |

**Variação** (`change(atual, anterior)`): Δ = atual − anterior; % = Δ ÷ |anterior|.
Se anterior = 0: % = null — o texto diz “sem base no período anterior” (ou “sem registros nos dois
períodos” se ambos 0). Nunca há divisão por zero.

## 3. Estudos (`stats_study`)

| Métrica              | Fórmula                                                                                          | Fonte                                        | Unidade  | Inclui / exclui                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| Tempo de estudo      | Σ interseção(atividade, dia) para atividades `kind = 'study'` ou ligadas a matéria/tópico/sessão | `activities` (+ `session_pauses` via sessão) | s        | Inclui cronômetro e lançamentos manuais; atividade que começou antes do período conta só a parte dentro |
| Cronômetro × manual  | Mesma soma separada por `session_id` não nulo / nulo                                             | `activities.session_id`                      | s        | —                                                                                                       |
| Média por dia        | tempo ÷ dias transcorridos do período                                                            | série diária                                 | s/dia    | Dias sem estudo contam 0; dias futuros não contam. Sem dia transcorrido: “—”                            |
| Média por dia ativo  | tempo ÷ dias com tempo > 0                                                                       | série diária                                 | s/dia    | “—” se nenhum dia teve estudo                                                                           |
| Sessões              | nº de `focus_sessions` concluídas, **iniciadas** no período, com líquido > 0                     | `focus_sessions`, `session_pauses`           | sessões  | Descartadas e com líquido 0 ficam de fora (`discardedZero` informa quantas)                             |
| Pausas (%)           | (bruto − líquido) ÷ bruto das sessões acima                                                      | idem                                         | %        | “—” sem sessões                                                                                         |
| Questões / acerto    | Σ `questions_count`; acerto = Σ `correct_count` ÷ Σ `questions_count`                            | `session_reflections` das sessões do período | %        | “—” sem questões                                                                                        |
| Revisões por nota    | nº de `review_attempts` com `reviewed_at` no período, por nota 1–4                               | `review_attempts`                            | revisões | Adiamentos: linhas `review_schedule_log` com `reason = 'postponed'` no período                          |
| Atrasadas/para hoje  | Situação **atual** (não depende do período)                                                      | `review_cards` ativos                        | cartões  | —                                                                                                       |
| Por matéria / tópico | Tempo de estudo agrupado por `subject_id` / `topic_id`                                           | `activities`                                 | s        | Tempo sem matéria aparece como “Sem matéria”                                                            |

## 4. Tarefas e projetos (`stats_tasks`, `task_time_totals`)

| Métrica                           | Fórmula                                                                                                                                        | Observações                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Criadas / concluídas / canceladas | nº com `created_at` / `completed_at` (status done) / `cancelled_at` no período                                                                 | Reabrir e concluir de novo move a conclusão para a nova data                            |
| Com prazo no período              | tarefas com `due_on ∈ período`: total, canceladas, concluídas no prazo (dia local da conclusão ≤ prazo), com atraso, abertas, abertas vencidas | —                                                                                       |
| Prazos cumpridos                  | no prazo ÷ (com prazo − canceladas − abertas ainda não vencidas)                                                                               | Abertas que ainda podem ser feitas no prazo não contam contra nem a favor; base 0 → “—” |
| Abertas / atrasadas agora         | Situação atual                                                                                                                                 | —                                                                                       |
| Estimado                          | `tasks.estimate_minutes`                                                                                                                       | Opcional; sem estimativa a tarefa fica fora das comparações                             |
| Planejado                         | Σ duração dos blocos do calendário com `task_id` (recorrentes expandidos da criação até o prazo, ou 4 semanas à frente)                        | Mostra também quanto ainda está no futuro                                               |
| Realizado                         | Σ `activities.duration_seconds` com `task_id` (`task_time_totals`)                                                                             | Inclui sessões de foco ligadas à tarefa                                                 |
| Realizado − estimado              | realizado − estimado; relativo = (realizado − estimado) ÷ estimado                                                                             | Sem estimativa: “—”. **Nada disso conclui a tarefa** (concluir é sempre manual)         |
| Realizado ÷ estimado (período)    | **mediana** de realizado ÷ estimado das tarefas concluídas no período com estimativa **e** tempo > 0                                           | Tarefas sem tempo registrado são contadas à parte; % dentro de ±25 % da estimativa      |
| Projeto                           | tarefas concluídas ÷ não canceladas; atrasadas; marcos concluídos/atrasados                                                                    | Situação atual de projetos planejados, ativos ou em pausa                               |

## 5. Atividades (`stats_activities`)

| Métrica    | Fórmula                                             | Observações                                                        |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Tempo      | Σ interseção(atividade, dia) — todas as atividades  | Mesma regra de recorte por dia                                     |
| Quantidade | nº de atividades **iniciadas** no período           | Por tipo e por categoria                                           |
| Leitura    | Σ `pages` das leituras iniciadas; títulos distintos | Leituras sem páginas contam na quantidade e são informadas à parte |
| Exercício  | Σ `distance_km` dos exercícios iniciados            | Idem para distância ausente                                        |

## 6. Metas e hábitos

**Valor do ciclo** — `private.goal_value` (Fase 3, ADR-028), recalculado dos registros de origem
no ciclo de calendário da meta. `stats_goals` lista os ciclos que se sobrepõem ao período (até
hoje). **Alvo do ciclo** = alvo em vigor no fim do ciclo, reconstruído de `goal_changes`
(`private.goal_target_at`): mudar a meta não reescreve a avaliação de ciclos antigos.
**Ciclos atingidos** = ciclos **encerrados** com valor ≥ alvo ÷ ciclos encerrados (o ciclo em
andamento não entra). Metas de tarefas com **“só tarefas vinculadas”** contam apenas tarefas com
`goal_id` igual à meta.

**Comparação de metas e hábitos com o período anterior**: taxas (ciclos atingidos ÷ encerrados;
consistência média) são comparadas em **pontos percentuais** — Δ = taxa atual − taxa anterior
(`describeRateChange`). Variação relativa de uma taxa engana (40 % → 50 % seria “+25 %”). Sem base em
um dos períodos, o texto diz isso. A tabela de hábitos mostra a consistência do período anterior
equivalente (alinhado, se o atual está em andamento).

**Consistência de hábito no período** (`consistencyInRange`) = cumpridos ÷ esperados.
Esperado: dia elegível (todo dia, ou dias da semana escolhidos) a partir do início do hábito, até
hoje; no modo “N vezes por semana”, semanas que **começam** no período. Hoje (ou a semana atual)
só entra se já foi cumprido. Marcação abaixo da meta por marcação não conta. Base 0 → “—”.
Limitação: pausas de hábito não têm histórico — um hábito pausado é avaliado como se tivesse
ficado ativo.

## 7. Revisão semanal (`weekly.ts`)

| Métrica                            | Fórmula                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Planejado em blocos / compromissos | Σ duração das ocorrências com horário na semana (blocos = `kind ≠ 'event'`)                                      |
| Realizado nos blocos vinculados    | Σ tempo das atividades da mesma matéria/tarefa **dentro do horário** de cada bloco (proporcional à sobreposição) |
| Aderência aos blocos               | realizado nos blocos vinculados ÷ planejado em blocos vinculados (“—” sem blocos vinculados)                     |
| Por dia                            | planejado em blocos × tempo registrado (`stats_activities.days`)                                                 |
| Tarefas, estudo, metas, hábitos    | Mesmas definições das seções 3–6, com período = a semana                                                         |
| Conflitos                          | Seção 8                                                                                                          |

Não existe “nota da semana”: os fatos ficam lado a lado, e o usuário registra anotações e
prioridades (`weekly_reviews`, `weekly_review_priorities`).

## 8. Agenda: conflitos e carga

- **Conflito**: dois itens com horário (compromissos `kind = 'event'` ou blocos planejados) cujos
  intervalos se sobrepõem por ≥ 1 min, após expandir recorrências e aplicar exceções. Prazos de
  tarefas, revisões (marcações de dia) e o tempo realizado nunca conflitam. Gravidade: dois
  compromissos > compromisso × bloco > dois blocos.
- **Carga planejada do dia**: Σ minutos de compromissos e blocos com horário naquele dia local
  (itens que cruzam a meia-noite são divididos). Comparada com `planning_preferences.daily_load_limit_minutes`
  (padrão 480 min).

## 9. Exportação

- **JSON completo** (`export_my_data` v3, Configurações): todas as tabelas do usuário, inclusive
  disponibilidade, preferências, revisões semanais e histórico de recomendações. Estrutura:
  `{ format: "lifeos-export", version: 3, exportedAt, account, profile, planningPreferences, <tabela>: [...] }`.
- **CSV por tabela** (Configurações): uma tabela por arquivo, cabeçalho = união das colunas,
  UTF-8 com BOM, vírgula, RFC 4180; JSON aninhado vira texto; células que começariam com
  `= + - @` recebem `'` (proteção contra injeção de fórmulas).
- **Resumo semanal** (Revisão semanal): CSV `Métrica,Valor,Unidade` e JSON
  `{ format: "lifeos-weekly-summary", version: 1, ... }` com os campos da seção 7.

Tudo é gerado a partir de leituras autenticadas (RLS); nada é enviado a terceiros.

## 10. Desempenho

As agregações rodam no banco e devolvem só os totais do período (no máximo 731 linhas diárias);
o navegador não baixa atividades brutas para calcular estatísticas. As consultas usam índices por usuário e
instante: `activities(user_id, started_at)`, `focus_sessions(user_id, started_at)` e, criados nesta
fase, `tasks(user_id, completed_at | created_at | due_on)`, `review_attempts(user_id, reviewed_at)` e
`review_schedule_log(user_id, changed_at)`. Os resultados ficam em cache
por período (TanStack Query, `staleTime` 60 s) e são invalidados por qualquer escrita em
domínios que os alimentam.

## 11. Critérios das recomendações

As recomendações usam **as mesmas métricas desta página** — não há um segundo cálculo para o
mesmo indicador. Cada regra é uma função pura em `src/modules/recommendations/logic/rules.ts`, com
gatilho, amostra mínima, prioridade, chave de deduplicação, espera após rejeição e critério de
encerramento. A tabela completa (11 regras) e o ciclo de vida estão em
[`docs/recommendations.md`](recommendations.md) §2–3; o resumo dos limiares:

| Regra                         | Dispara quando                                                   | Métrica usada (seção)           | Amostra mínima      |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------- | ------------------- |
| `review.overdue`              | ≥ 1 revisão ativa com data < hoje                                | revisões atrasadas agora (§3)   | —                   |
| `review.due_soon`             | revisões para hoje ou amanhã                                     | revisões para hoje (§3)         | —                   |
| `task.high_priority_due_soon` | tarefa aberta, prioridade alta, prazo em até 2 dias              | tarefas abertas (§4)            | —                   |
| `task.overdue`                | ≥ 1 tarefa aberta com prazo < hoje                               | atrasadas agora (§4)            | —                   |
| `calendar.conflict`           | sobreposição ≥ 1 min nos próximos 7 dias                         | conflitos (§8)                  | —                   |
| `day.overload`                | minutos com horário no dia > limite diário (padrão 480)          | carga planejada por dia (§8)    | —                   |
| `goal.stalled`                | metade do ciclo sem progresso, ou ritmo 25 p.p. abaixo do linear | progresso da meta no ciclo (§6) | metas não diárias   |
| `estimate.drift`              | mediana realizado ÷ estimado fora de [0,67; 1,5]                 | mediana da razão (§4)           | 5 tarefas           |
| `habit.below_target`          | consistência < 60 % em 28 dias                                   | consistência do hábito (§6)     | 8 dias elegíveis    |
| `project.milestone_overdue`   | marco aberto vencido em projeto ativo                            | marcos (§4)                     | —                   |
| `week.review_due`             | fim da semana sem revisão salva                                  | —                               | conta com registros |

Regras gerais: o banco garante **uma** recomendação aberta por regra + chave (índice único); depois
de rejeitada ou resolvida pelo usuário, a mesma chave não volta durante a espera da regra (1–14
dias); se a condição deixa de valer, ela é encerrada como `condition_cleared`. Abaixo da amostra
mínima a regra **não dispara** (silêncio em vez de conclusão sem base).

## 12. Consistência entre telas (Fase 5)

- Um indicador tem **um** cálculo. O dashboard, as Análises, a Revisão semanal e as Recomendações
  leem as mesmas funções (`stats_*`, `goal_progress`, `dashboard_summary`) e os mesmos módulos de
  `analytics/logic`.
- Toda escrita declara os domínios que altera (`src/lib/query/domains.ts`); o mapa de dependências
  invalida as leituras que dependem deles — editar uma sessão revalida estatísticas, metas,
  atividades, calendário e dashboard.
- Verificado contra o banco real em `src/tests/integration/consistency.integration.test.ts`:
  corrigir a duração de uma sessão muda o tempo de estudo no mesmo valor; excluí-la devolve o total
  anterior; mover o prazo de uma tarefa para fora do período a retira da base de prazos; excluir a
  tarefa também; editar o alvo de uma meta não altera os lançamentos que formam o progresso.

## 13. Gráficos de tendência, ritmo e horário

- **Minilinha e seta nos cartões**: a minilinha é a mesma série do gráfico de evolução do
  período (dia/semana/mês); a seta ▲/▼ acompanha o texto da comparação com o período anterior
  equivalente (§2) — a cor nunca é a única pista.
- **Período anterior no gráfico de estudo**: o mesmo agrupamento aplicado ao período anterior,
  alinhado pela posição (1º dia com 1º dia). A linha tracejada é a média dos baldes já
  transcorridos.
- **Quando você rende mais**: atividades das 8 semanas que terminam no fim do período (ou hoje),
  com o tempo líquido repartido pelas horas locais na proporção do intervalo bruto; mostra a média
  por semana. O "melhor horário" é a janela de 1–2 h com mais tempo, somando dias com ≥ 80 % desse
  valor; só aparece com ao menos 2 h registradas.
- **Seu tempo por dia (Atividades)**: mesmo recorte por dia local, por tipo de atividade, calculado
  no navegador a partir das atividades do período (que o RLS já limita à conta).
- **Ritmo das metas**: ciclo que contém hoje. Esperado = alvo × dias transcorridos (contando hoje)
  ÷ dias do ciclo; "no ritmo" = diferença de até 5 % do alvo; projeção = média por dia até agora ×
  dias do ciclo. Metas sem data final não têm ritmo.
- **Seu ano em hábitos**: últimas 53 semanas até hoje; dia esperado e marcação cumprida pelas
  mesmas regras do módulo de hábitos (§6). No modo "N por semana" nenhum dia vira "falta".
- **Últimas 8 semanas (revisão semanal)**: tempo registrado por semana (stats_activities) e
  tarefas concluídas (stats_tasks); a média exclui a semana selecionada.
