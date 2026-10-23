# Recomendações e planejamento adaptativo

**Tudo aqui é software convencional e determinístico.** Não há inteligência artificial, modelo
estatístico, aprendizado de máquina, integração com LLM, chatbot ou serviço externo — nem
dependências para isso. Cada recomendação é produzida por uma regra fixa, escrita em TypeScript,
testada e documentada abaixo. O planejamento é uma heurística gulosa explicável.

## 1. Arquitetura

```
dados (TanStack Query) ─► RuleContext ─► RULES[i].evaluate() ─► candidatas
                                                         │
                       public.sync_recommendations(candidatas, regras avaliadas)
                                                         │
                              recommendations (estado, histórico, deduplicação)
```

- `src/modules/recommendations/logic/rules.ts` — registro de regras (id, descrição, gatilho,
  dados, amostra mínima, prioridade, encerramento, função `evaluate`).
- `use-recommendation-engine.ts` — monta o `RuleContext` com os dados já carregados e sincroniza
  **somente quando o resultado muda** (assinatura das candidatas). Roda ao abrir o Dashboard e a
  tela Recomendações; no modo demonstração não roda.
- Uma regra cujos dados não carregaram, ou sem amostra mínima, **não é declarada como avaliada**:
  suas recomendações abertas não são encerradas por engano.
- `public.sync_recommendations` (migration `20261022120000_integration_recommendations.sql`) é a
  única via de criação (o gatilho `recommendations_guard` recusa inserções diretas: 42501).

## 2. Ciclo de vida e controle do usuário

| Estado      | Como chega                                                                                    | Pode ir para                                   |
| ----------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `pending`   | criada pela regra; adiamento vencido; “Reativar agora”                                        | `accepted`, `snoozed`, `dismissed`, `resolved` |
| `accepted`  | usuário aceita (só registra; **nada é alterado na agenda**)                                   | `dismissed`, `resolved`                        |
| `snoozed`   | usuário adia (`snoozed_until` > agora, no máximo 30 dias)                                     | `pending`, `accepted`, `dismissed`, `resolved` |
| `dismissed` | usuário rejeita (motivo opcional em `decision_note`)                                          | — (encerrada, imutável)                        |
| `resolved`  | usuário marca resolvida (`user_resolved`) ou a condição deixou de valer (`condition_cleared`) | —                                              |
| `expired`   | passou `expires_at`                                                                           | —                                              |

Cada decisão grava `decided_at`; encerramentos gravam `closed_at` e `close_reason`. O histórico
fica na própria linha (aba **Histórico**), e o banco recusa transições inválidas (23514) e edição
do conteúdo pelo navegador (título, motivo e evidências só mudam pela sincronização).

**Deduplicação**: no máximo **uma** recomendação aberta por `(usuário, regra, escopo)` — índice
único parcial `recommendations_one_open_per_scope`. Reavaliar atualiza a existente (texto,
evidências, `last_seen_at`) em vez de criar outra.
**Período de espera**: depois de rejeitada ou resolvida pelo usuário, a mesma regra+escopo não é
recriada por `cooldownDays` (por regra, abaixo). Se a situação persistir depois disso, volta.
**Ações sugeridas** são apenas atalhos de navegação (`{ kind: 'navigate', to, label }`) para a tela
onde o usuário decide. Nenhuma recomendação move eventos, conclui tarefas ou altera metas.

## 3. Regras

Prioridade: 1 = alta, 2 = média, 3 = baixa. “Escopo” é a chave de deduplicação.

| Id                            | Dispara quando                                                                                                                                           | Dados                            | Amostra mínima                                   | Prioridade                                         | Escopo                  | Espera | Encerra                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------ | -------------------------------------------------- | ----------------------- | ------ | --------------------------------------------- |
| `review.overdue`              | ≥ 1 revisão ativa com data < hoje                                                                                                                        | `review_cards`                   | —                                                | 1 se ≥ 5 ou alguma com ≥ 7 dias de atraso; senão 2 | `all`                   | 1 d    | sem atrasadas                                 |
| `review.due_soon`             | revisões ativas para hoje ou amanhã                                                                                                                      | `review_cards`                   | —                                                | 3                                                  | `day:<hoje>`            | 1 d    | sem revisões; expira no fim de amanhã         |
| `task.high_priority_due_soon` | tarefa aberta, prioridade alta, prazo ∈ [hoje, hoje+2]                                                                                                   | `tasks`                          | —                                                | 1                                                  | `task:<id>:<prazo>`     | 1 d    | concluída/cancelada/prazo ou prioridade mudou |
| `task.overdue`                | ≥ 1 tarefa aberta com prazo < hoje                                                                                                                       | `tasks`                          | —                                                | 1 se alguma alta; senão 2                          | `all`                   | 1 d    | sem atrasadas                                 |
| `calendar.conflict`           | sobreposição ≥ 1 min entre compromissos/blocos nos próximos 7 dias                                                                                       | `calendar_events` + exceções     | —                                                | 1 entre compromissos; 2 com bloco                  | `<item A>\|<item B>`    | 7 d    | um item mudou; expira no fim da sobreposição  |
| `goal.stalled`                | semanal/mensal: ≥ 50 % do ciclo e valor 0 · “até o prazo” com prazo: ≥ 25 % do tempo e progresso < ritmo linear − 25 pp · sem prazo: > 14 dias e valor 0 | `goals`, `goal_progress`         | não avalia metas diárias                         | 2                                                  | `goal:<id>:<ciclo>`     | 3–7 d  | avançou, pausada/arquivada, ciclo mudou       |
| `day.overload`                | minutos com horário no dia > limite diário (padrão 480) — hoje e 6 dias seguintes                                                                        | agenda + `planning_preferences`  | —                                                | 2                                                  | `day:<data>`            | 1 d    | carga voltou ao limite; expira no fim do dia  |
| `estimate.drift`              | mediana de realizado ÷ estimado fora de [0,67; 1,5] (tarefas concluídas nos últimos 90 dias)                                                             | `stats_tasks.estimates`          | **5** tarefas com estimativa e tempo             | 3                                                  | `over` / `under`        | 14 d   | mediana volta à faixa                         |
| `habit.below_target`          | consistência < 60 % nos últimos 28 dias                                                                                                                  | `habits`, `habit_checkins`       | **8** dias elegíveis (4 semanas no modo semanal) | 3                                                  | `habit:<id>`            | 7 d    | consistência ≥ 60 %                           |
| `project.milestone_overdue`   | marco aberto com data < hoje em projeto ativo                                                                                                            | `project_milestones`, `projects` | —                                                | 2                                                  | `milestone:<id>:<data>` | 3 d    | marco concluído/data mudou/projeto encerrado  |
| `week.review_due`             | último dia da semana ou 2 primeiros da seguinte, sem revisão salva                                                                                       | `weekly_reviews`                 | conta com algum registro                         | 3                                                  | `week:<início>`         | 3 d    | revisão salva; expira 2 dias após a semana    |

Textos (“Por quê”) e evidências mostram exatamente os números que dispararam a regra. Testes:
`rules.test.ts` (cada regra, amostras insuficientes, prioridades, deduplicação na avaliação) e
pgTAP `06_phase4_rules.test.sql` (inserção direta bloqueada, deduplicação, aceitar, encerrar por
condição, rejeitar + espera, adiar e reabrir, expiração, estados encerrados imutáveis, regra não
declarada).

## 4. Planejamento adaptativo (`/calendario/planejar`)

Entrada: janelas de **disponibilidade** por dia da semana (`availability_windows`, sem
sobreposição — 23P01), **preferências** (`planning_preferences`: bloco mínimo/máximo, descanso,
período preferido, limite diário), compromissos e blocos existentes (recorrências expandidas),
tarefas abertas (prioridade, prazo, estimativa, realizado, já reservado) e matérias com meta
semanal (`subjects.target_minutes_per_week` − estudado na semana − reservado).

Algoritmo (`src/modules/planning/logic/planner.ts`, determinístico):

1. Livre por dia = janelas − (itens existentes ± descanso) − passado.
2. Ordem: tarefas por prazo → prioridade → criação; depois matérias (maior saldo primeiro).
3. Cada demanda ocupa os primeiros horários livres (período preferido primeiro), em blocos entre
   o mínimo e o máximo, sem passar do limite diário; tarefas com prazo só até o dia do prazo;
   matérias só até o fim da semana.
4. **Histórico**: com ≥ 5 tarefas concluídas comparáveis, a estimativa é multiplicada pela
   mediana de realizado ÷ estimado (limitada a 0,5–2), e isso é dito na tela; com menos, a
   estimativa é usada como está.
5. O que não couber aparece em “Sem horário disponível”, com o motivo e alternativas (mais
   janelas, mover blocos flexíveis, rever prazo/dividir a tarefa, aumentar o limite).

Cada proposta mostra “Por que este horário?”. O usuário **edita** horário e duração, **desmarca**
o que não quer, **descarta** o plano ou **cria** os blocos selecionados (confirmação explícita;
uma única inserção). Conflitos das edições com a agenda são apontados antes de criar. Nada
existente é sobrescrito, nenhuma tarefa é concluída, e a tela diz que a sugestão **não é
necessariamente o melhor plano possível**.
