-- =============================================================================
-- LifeOS · 013 · Fase 4 — Integração, recomendações, planejamento e revisão semanal
--
--  * Tarefa ↔ meta: tasks.goal_id; metas "tarefas concluídas" podem contar só as
--    tarefas vinculadas (goals.linked_tasks_only).
--  * Eventos com categoria (cor e filtro consistentes com as atividades).
--  * Recomendações: ciclo de vida completo (aceitar, rejeitar, adiar, resolver,
--    encerramento automático quando a condição deixa de valer), deduplicação por
--    (regra, escopo) e período de espera após uma rejeição. As regras são avaliadas na
--    interface (TypeScript, testadas) e GRAVADAS somente por sync_recommendations.
--  * Disponibilidade e preferências para o planejamento adaptativo.
--  * Revisão semanal: observações e prioridades da semana seguinte.
--
-- Nenhuma migration anterior foi alterada (ver docs/decisions.md, ADR-031..036).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tarefa ↔ meta
-- -----------------------------------------------------------------------------
alter table public.tasks add column goal_id uuid;
alter table public.tasks
  add constraint tasks_goal_fk foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete set null (goal_id);
create index tasks_goal_idx on public.tasks (goal_id) where goal_id is not null;

comment on column public.tasks.goal_id is
  'Meta para a qual a tarefa contribui. Só altera números em metas "tarefas concluídas" com linked_tasks_only.';

alter table public.goals
  add column linked_tasks_only boolean not null default false,
  add constraint goals_linked_tasks_only_mode check (not linked_tasks_only or progress_mode = 'tasks_completed');

comment on column public.goals.linked_tasks_only is
  'Meta "tarefas concluídas": conta só as tarefas vinculadas a ela (tasks.goal_id).';

-- Valor de uma meta no intervalo (substitui a versão da Fase 3; só "tasks_completed" mudou).
create or replace function private.goal_value(p_goal public.goals, p_from date, p_to date, p_tz text)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from timestamptz := (p_from::timestamp) at time zone p_tz;
  v_to timestamptz := (p_to::timestamp) at time zone p_tz;
  v numeric;
begin
  if p_to <= p_from then
    return 0;
  end if;
  case p_goal.progress_mode
    when 'manual' then
      select coalesce(sum(e.amount), 0) into v
        from public.goal_progress_entries e
       where e.goal_id = p_goal.id and e.recorded_on >= p_from and e.recorded_on < p_to;
    when 'activity_time' then
      select coalesce(sum(private.activity_seconds_in_range(a, v_from, v_to)), 0) / 3600.0 into v
        from public.activities a
       where a.started_at < v_to and a.ended_at > v_from
         and (p_goal.subject_id is null or a.subject_id = p_goal.subject_id)
         and (p_goal.activity_category_id is null or a.category_id = p_goal.activity_category_id)
         and (p_goal.activity_kind is null or a.kind = p_goal.activity_kind)
         and (p_goal.project_id is null or a.project_id = p_goal.project_id
              or a.task_id in (select t.id from public.tasks t where t.project_id = p_goal.project_id));
    when 'study_sessions' then
      select count(*) into v
        from public.focus_sessions s
       where s.status = 'completed' and s.started_at >= v_from and s.started_at < v_to
         and (p_goal.subject_id is null or s.subject_id = p_goal.subject_id)
         and private.focus_session_net_seconds(s.id) > 0;
    when 'questions' then
      select coalesce(sum(r.questions_count), 0) into v
        from public.session_reflections r
        join public.focus_sessions s on s.id = r.session_id
       where s.status = 'completed' and s.started_at >= v_from and s.started_at < v_to
         and (p_goal.subject_id is null or s.subject_id = p_goal.subject_id);
    when 'pages' then
      select coalesce(sum(a.pages), 0) into v
        from public.activities a
       where a.kind = 'reading' and a.started_at >= v_from and a.started_at < v_to;
    when 'tasks_completed' then
      select count(*) into v
        from public.tasks t
       where t.status = 'done' and t.completed_at >= v_from and t.completed_at < v_to
         and (p_goal.project_id is null or t.project_id = p_goal.project_id)
         and (not p_goal.linked_tasks_only or t.goal_id = p_goal.id);
    when 'habit_checkins' then
      select count(*) into v
        from public.habit_checkins c
        join public.habits h on h.id = c.habit_id
       where c.habit_id = p_goal.habit_id and c.local_date >= p_from and c.local_date < p_to
         and (h.target_value is null or coalesce(c.value, 0) >= h.target_value);
  end case;
  return round(coalesce(v, 0), 2);
end;
$$;

-- Alvo em vigor num instante: mudanças de alvo ficam em goal_changes (Fase 3), então
-- comparar ciclos antigos usa o alvo da época — editar a meta não reescreve o passado.
create function private.goal_target_at(p_goal_id uuid, p_current numeric, p_at timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select c.new_target from public.goal_changes c
      where c.goal_id = p_goal_id and c.changed_at <= p_at and c.new_target is distinct from c.old_target
      order by c.changed_at desc limit 1),
    (select c.old_target from public.goal_changes c
      where c.goal_id = p_goal_id and c.changed_at > p_at and c.new_target is distinct from c.old_target
      order by c.changed_at asc limit 1),
    p_current
  );
$$;

grant execute on function private.goal_target_at(uuid, numeric, timestamptz) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Calendário: categoria do evento (mesmas categorias e cores das atividades)
-- -----------------------------------------------------------------------------
alter table public.calendar_events add column category_id uuid;
alter table public.calendar_events
  add constraint calendar_events_category_fk foreign key (category_id, user_id)
    references public.activity_categories (id, user_id) on delete set null (category_id);
create index calendar_events_category_idx on public.calendar_events (category_id) where category_id is not null;

-- -----------------------------------------------------------------------------
-- Recomendações: ciclo de vida e deduplicação
--   abertas:   pending · snoozed (até snoozed_until) · accepted
--   fechadas:  dismissed (rejeitada) · resolved (pelo usuário ou porque a condição
--              deixou de valer) · expired (venceu sem ação)
-- -----------------------------------------------------------------------------
drop trigger recommendations_record_decision on public.recommendations;
drop function private.recommendations_record_decision();

alter table public.recommendations
  drop constraint recommendations_status_valid,
  drop constraint recommendations_decision_consistent;

alter table public.recommendations
  add column dedup_key text not null default ''
    constraint recommendations_dedup_key_format check (char_length(dedup_key) <= 200),
  add column priority smallint not null default 2
    constraint recommendations_priority_range check (priority between 1 and 3),
  -- Ação sugerida: { "kind": "navigate", "to": "/tarefas?tarefa=…", "label": "Abrir tarefa" }.
  -- Nunca é executada sozinha: a interface apresenta e o usuário confirma.
  add column action jsonb
    constraint recommendations_action_object check (action is null or jsonb_typeof(action) = 'object'),
  add column snoozed_until timestamptz,
  add column closed_at timestamptz,
  add column close_reason text
    constraint recommendations_close_reason_valid check (
      close_reason in ('dismissed', 'user_resolved', 'condition_cleared', 'expired')),
  add column last_seen_at timestamptz not null default now(),
  add constraint recommendations_status_valid check (
    status in ('pending', 'accepted', 'snoozed', 'dismissed', 'resolved', 'expired')),
  add constraint recommendations_decision_required check (
    status not in ('accepted', 'dismissed', 'snoozed') or decided_at is not null),
  add constraint recommendations_snooze_consistent check ((status = 'snoozed') = (snoozed_until is not null)),
  add constraint recommendations_closed_consistent check (
    (status in ('dismissed', 'resolved', 'expired')) = (closed_at is not null)
    and (closed_at is null) = (close_reason is null));

update public.recommendations
   set closed_at = coalesce(decided_at, updated_at),
       close_reason = case status when 'dismissed' then 'dismissed' else 'expired' end
 where status in ('dismissed', 'expired');

-- Deduplicação: no máximo UMA recomendação aberta por (usuário, regra, escopo).
create unique index recommendations_one_open_per_scope on public.recommendations (user_id, rule_id, dedup_key)
  where status in ('pending', 'snoozed', 'accepted');
create index recommendations_user_closed_idx on public.recommendations (user_id, rule_id, dedup_key, closed_at desc)
  where status in ('dismissed', 'resolved');

-- Privilégios por coluna. A função de sincronização roda com os privilégios do usuário
-- (SECURITY INVOKER, RLS valendo), por isso o papel precisa poder escrever as colunas de
-- conteúdo; quem impede o navegador de criar ou reescrever uma recomendação DIRETAMENTE é o
-- gatilho abaixo, que só aceita essas escritas dentro de sync_recommendations (GUC local da
-- transação, que a API não permite definir). O usuário, por conta própria, só decide:
-- estado, nota e "adiar até".
revoke update on table public.recommendations from authenticated;
grant update (status, decision_note, snoozed_until, title, rationale, evidence, priority, action,
              expires_at, last_seen_at)
  on table public.recommendations to authenticated;
grant insert (rule_id, dedup_key, title, rationale, evidence, priority, action, expires_at)
  on table public.recommendations to authenticated;

create function private.recommendations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_system boolean := coalesce(pg_catalog.current_setting('lifeos.recommendation_sync', true), '') = 'on';
  v_now timestamptz := pg_catalog.now();
begin
  -- A proteção vale para os papéis da API (navegador). Administração do banco
  -- (service_role, migrations, fixtures de teste) não passa por aqui.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not v_system then
      raise exception 'Recomendações são criadas apenas pelo motor de regras'
        using errcode = '42501';
    end if;
    new.status := 'pending';
    new.generated_at := v_now;
    new.last_seen_at := v_now;
    new.decided_at := null;
    new.snoozed_until := null;
    new.closed_at := null;
    new.close_reason := null;
    return new;
  end if;

  -- Conteúdo só muda pela função de sincronização.
  if not v_system and (
       new.title is distinct from old.title or new.rationale is distinct from old.rationale
       or new.evidence is distinct from old.evidence or new.rule_id is distinct from old.rule_id
       or new.dedup_key is distinct from old.dedup_key or new.action is distinct from old.action) then
    raise exception 'O conteúdo de uma recomendação não é editável' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('dismissed', 'resolved', 'expired') then
      raise exception 'Recomendação já encerrada (%)', old.status
        using errcode = '23514', constraint = 'recommendations_decision_transition';
    end if;

    if v_system then
      -- Transições do motor: reabrir um adiamento vencido, encerrar porque a condição
      -- deixou de valer ou porque expirou.
      if not ((old.status = 'snoozed' and new.status = 'pending')
              or new.status in ('resolved', 'expired')) then
        raise exception 'Transição de sistema inválida: % → %', old.status, new.status
          using errcode = '23514', constraint = 'recommendations_decision_transition';
      end if;
      if new.status = 'pending' then
        new.snoozed_until := null;
      end if;
    else
      if not (
           (old.status = 'pending' and new.status in ('accepted', 'dismissed', 'snoozed', 'resolved'))
        or (old.status = 'snoozed' and new.status in ('pending', 'accepted', 'dismissed', 'resolved'))
        or (old.status = 'accepted' and new.status in ('dismissed', 'resolved'))
      ) then
        raise exception 'Recomendação % não pode passar a %', old.status, new.status
          using errcode = '23514', constraint = 'recommendations_decision_transition';
      end if;
      new.decided_at := v_now;
      if new.status = 'snoozed' then
        if new.snoozed_until is null or new.snoozed_until <= v_now
           or new.snoozed_until > v_now + interval '30 days' then
          raise exception 'Adie por até 30 dias' using errcode = '22023';
        end if;
      else
        new.snoozed_until := null;
      end if;
    end if;

    if new.status in ('dismissed', 'resolved', 'expired') then
      new.closed_at := v_now;
      new.close_reason := case
        when new.status = 'dismissed' then 'dismissed'
        when new.status = 'expired' then 'expired'
        when v_system then 'condition_cleared'
        else 'user_resolved'
      end;
    end if;
  elsif not v_system and new.snoozed_until is distinct from old.snoozed_until then
    raise exception 'Para adiar, mude o estado para "adiada"' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger recommendations_guard before insert or update on public.recommendations
  for each row execute function private.recommendations_guard();

-- Sincroniza as recomendações do usuário com as candidatas calculadas pelas regras.
--   p_candidates: [{ ruleId, dedupKey, title, rationale, evidence, priority, action,
--                    expiresAt?, cooldownDays }]
--   p_rules: regras AVALIADAS nesta execução. Uma recomendação aberta de uma regra avaliada
--            que não voltou como candidata é encerrada (condição deixou de valer). Regras
--            não avaliadas (dados insuficientes, erro) não são tocadas.
-- Deduplicação: candidata com recomendação aberta no mesmo (regra, escopo) só atualiza os
-- números; após rejeição ou resolução pelo usuário, nada é recriado durante cooldownDays.
create function public.sync_recommendations(p_candidates jsonb, p_rules text[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.now();
  c jsonb;
  v_rule text;
  v_key text;
  v_cooldown integer;
  v_open public.recommendations;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_closed integer := 0;
  v_expired integer := 0;
  v_reopened integer := 0;
  v_skipped_expired integer := 0;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'Candidatas inválidas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_candidates) > 200 then
    raise exception 'Candidatas demais' using errcode = '22023';
  end if;

  perform pg_catalog.set_config('lifeos.recommendation_sync', 'on', true);

  -- Adiamentos vencidos voltam a pendentes (e serão encerrados abaixo se não valem mais).
  update public.recommendations
     set status = 'pending'
   where status = 'snoozed' and snoozed_until <= v_now;
  get diagnostics v_reopened = row_count;

  for c in select * from jsonb_array_elements(p_candidates) loop
    v_rule := c ->> 'ruleId';
    v_key := coalesce(c ->> 'dedupKey', '');
    v_cooldown := least(greatest(coalesce((c ->> 'cooldownDays')::integer, 3), 0), 90);
    if v_rule is null or not (v_rule = any (coalesce(p_rules, '{}'))) then
      raise exception 'Candidata de regra não avaliada: %', v_rule using errcode = '22023';
    end if;

    select * into v_open from public.recommendations r
     where r.rule_id = v_rule and r.dedup_key = v_key and r.status in ('pending', 'snoozed', 'accepted');
    if found then
      update public.recommendations
         set title = c ->> 'title',
             rationale = c ->> 'rationale',
             evidence = coalesce(c -> 'evidence', '{}'::jsonb),
             priority = coalesce((c ->> 'priority')::smallint, 2),
             action = c -> 'action',
             expires_at = (c ->> 'expiresAt')::timestamptz,
             last_seen_at = v_now
       where id = v_open.id;
      v_updated := v_updated + 1;
      continue;
    end if;

    if exists (
      select 1 from public.recommendations r
       where r.rule_id = v_rule and r.dedup_key = v_key
         and r.close_reason in ('dismissed', 'user_resolved')
         and r.closed_at > v_now - make_interval(days => v_cooldown)
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Uma candidata que já nasce vencida não é criada.
    if (c ->> 'expiresAt') is not null and (c ->> 'expiresAt')::timestamptz <= v_now then
      v_skipped_expired := v_skipped_expired + 1;
      continue;
    end if;

    -- user_id vem do padrão auth.uid() (o papel não escreve essa coluna).
    insert into public.recommendations (rule_id, dedup_key, title, rationale, evidence, priority, action, expires_at)
    values (
      v_rule, v_key, c ->> 'title', c ->> 'rationale', coalesce(c -> 'evidence', '{}'::jsonb),
      coalesce((c ->> 'priority')::smallint, 2), c -> 'action', (c ->> 'expiresAt')::timestamptz
    );
    v_created := v_created + 1;
  end loop;

  -- Encerramento automático: a condição deixou de valer.
  update public.recommendations r
     set status = 'resolved'
   where r.status in ('pending', 'snoozed', 'accepted')
     and r.rule_id = any (coalesce(p_rules, '{}'))
     and not exists (
       select 1 from jsonb_array_elements(p_candidates) x
        where x ->> 'ruleId' = r.rule_id and coalesce(x ->> 'dedupKey', '') = r.dedup_key
     );
  get diagnostics v_closed = row_count;

  update public.recommendations
     set status = 'expired'
   where status in ('pending', 'snoozed', 'accepted') and expires_at is not null and expires_at <= v_now;
  get diagnostics v_expired = row_count;

  perform pg_catalog.set_config('lifeos.recommendation_sync', '', true);

  return jsonb_build_object(
    'created', v_created, 'updated', v_updated, 'skippedCooldown', v_skipped, 'skippedExpired', v_skipped_expired,
    'closed', v_closed, 'expired', v_expired, 'reopened', v_reopened
  );
end;
$$;

revoke all on function public.sync_recommendations(jsonb, text[]) from public, anon;
grant execute on function public.sync_recommendations(jsonb, text[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Planejamento: disponibilidade e preferências
-- -----------------------------------------------------------------------------
create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 0 = domingo … 6 = sábado
  weekday smallint not null
    constraint availability_windows_weekday_range check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_windows_order check (end_time > start_time),
  -- Janelas do mesmo dia não se sobrepõem.
  constraint availability_windows_no_overlap exclude using gist (
    user_id with =,
    weekday with =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time), '[)') with &&
  )
);

create index availability_windows_user_idx on public.availability_windows (user_id, weekday, start_time);

select private.secure_owned_table('public.availability_windows');

create table public.planning_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  -- Descanso entre blocos propostos.
  break_minutes smallint not null default 10
    constraint planning_preferences_break_range check (break_minutes between 0 and 120),
  min_block_minutes smallint not null default 25
    constraint planning_preferences_min_block_range check (min_block_minutes between 10 and 240),
  max_block_minutes smallint not null default 90
    constraint planning_preferences_max_block_range check (max_block_minutes between 15 and 480),
  -- Período preferido para foco: tentado primeiro, sem excluir os demais.
  preferred_period text not null default 'any'
    constraint planning_preferences_period_valid check (preferred_period in ('any', 'morning', 'afternoon', 'evening')),
  -- Acima disto (minutos com horário marcado num dia) o dia é considerado sobrecarregado.
  daily_load_limit_minutes smallint not null default 480
    constraint planning_preferences_load_range check (daily_load_limit_minutes between 60 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_preferences_blocks_ordered check (max_block_minutes >= min_block_minutes)
);

select private.secure_owned_table('public.planning_preferences');

-- -----------------------------------------------------------------------------
-- Revisão semanal
-- -----------------------------------------------------------------------------
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Primeiro dia da semana revisada (conforme o início de semana do perfil na época).
  week_start date not null,
  notes text not null default ''
    constraint weekly_reviews_notes_length check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reviews_id_user_unique unique (id, user_id),
  constraint weekly_reviews_one_per_week unique (user_id, week_start)
);

select private.secure_owned_table('public.weekly_reviews');

create table public.weekly_review_priorities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  review_id uuid not null,
  position smallint not null default 0
    constraint weekly_review_priorities_position_range check (position between 0 and 20),
  title text not null
    constraint weekly_review_priorities_title_length check (char_length(btrim(title)) between 1 and 200),
  task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_review_priorities_review_fk foreign key (review_id, user_id)
    references public.weekly_reviews (id, user_id) on delete cascade,
  constraint weekly_review_priorities_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id)
);

create index weekly_review_priorities_review_idx on public.weekly_review_priorities (review_id, position);
create index weekly_review_priorities_user_idx on public.weekly_review_priorities (user_id);
create index weekly_review_priorities_task_idx on public.weekly_review_priorities (task_id) where task_id is not null;

select private.secure_owned_table('public.weekly_review_priorities');
