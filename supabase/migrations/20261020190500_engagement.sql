-- =============================================================================
-- LifeOS · 006 · Recomendações (com a decisão do usuário) e lembretes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Recomendações (RN-14)
-- Geradas pelo sistema (Fase 7) e nunca pelo navegador: o usuário apenas lê,
-- decide (aceitar/dispensar) ou exclui.
-- -----------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Identificador estável da regra que gerou a sugestão, ex.: "review.due_with_free_slot".
  rule_id text not null
    constraint recommendations_rule_id_format check (rule_id ~ '^[a-z0-9_.-]{1,80}$'),
  title text not null
    constraint recommendations_title_length check (char_length(btrim(title)) between 1 and 200),
  -- Justificativa legível é obrigatória: sem "porquê", não há recomendação.
  rationale text not null
    constraint recommendations_rationale_length check (char_length(btrim(rationale)) between 1 and 1000),
  -- Retrato das evidências usadas (IDs e números), para auditoria da sugestão.
  -- Não substitui relacionamentos: é um registro histórico imutável do momento da geração.
  evidence jsonb not null default '{}'::jsonb
    constraint recommendations_evidence_object check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'pending'
    constraint recommendations_status_valid check (status in ('pending', 'accepted', 'dismissed', 'expired')),
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz,
  decision_note text
    constraint recommendations_decision_note_length check (char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendations_expiry_after_generation check (expires_at is null or expires_at > generated_at),
  constraint recommendations_decision_consistent check (
    (status in ('accepted', 'dismissed')) = (decided_at is not null)
  )
);

create index recommendations_user_idx on public.recommendations (user_id);
create index recommendations_user_pending_idx on public.recommendations (user_id, generated_at desc)
  where status = 'pending';

select private.secure_owned_table('public.recommendations');

-- O navegador não cria nem reescreve recomendações; só registra a decisão.
revoke insert, update on table public.recommendations from authenticated;
grant update (status, decision_note) on table public.recommendations to authenticated;

create function private.recommendations_record_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('accepted', 'dismissed') then
      raise exception 'Recomendação % não pode passar a %', old.status, new.status
        using errcode = '23514', constraint = 'recommendations_decision_transition';
    end if;
    new.decided_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

create trigger recommendations_record_decision before update on public.recommendations
  for each row
  when (current_user = 'authenticated')
  execute function private.recommendations_record_decision();

-- -----------------------------------------------------------------------------
-- Lembretes. A entrega (e-mail/push) depende de um agendador e entra em fase
-- futura; o modelo já guarda o que lembrar, quando e o estado de entrega.
-- -----------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null
    constraint reminders_title_length check (char_length(btrim(title)) between 1 and 200),
  remind_at timestamptz not null,
  channel text not null default 'in_app'
    constraint reminders_channel_valid check (channel in ('in_app', 'email')),
  -- No máximo um alvo; sem alvo = lembrete livre.
  task_id uuid,
  calendar_event_id uuid,
  habit_id uuid,
  review_card_id uuid,
  sent_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_single_target check (num_nonnulls(task_id, calendar_event_id, habit_id, review_card_id) <= 1),
  constraint reminders_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade,
  constraint reminders_event_fk foreign key (calendar_event_id, user_id)
    references public.calendar_events (id, user_id) on delete cascade,
  constraint reminders_habit_fk foreign key (habit_id, user_id)
    references public.habits (id, user_id) on delete cascade,
  constraint reminders_review_card_fk foreign key (review_card_id, user_id)
    references public.review_cards (id, user_id) on delete cascade
);

-- Fila de entrega: lembretes pendentes por instante.
create index reminders_pending_idx on public.reminders (remind_at)
  where sent_at is null and dismissed_at is null;
create index reminders_user_idx on public.reminders (user_id, remind_at);
create index reminders_task_idx on public.reminders (task_id) where task_id is not null;
create index reminders_event_idx on public.reminders (calendar_event_id) where calendar_event_id is not null;
create index reminders_habit_idx on public.reminders (habit_id) where habit_id is not null;
create index reminders_review_card_idx on public.reminders (review_card_id) where review_card_id is not null;

select private.secure_owned_table('public.reminders');
