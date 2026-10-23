-- =============================================================================
-- LifeOS · 008 · Fase 3 — Tarefas e projetos
--
--  * Tarefas: descrição, data de início, categoria, datas de execução (started_at,
--    cancelled_at), dependências que BLOQUEIAM a conclusão, regra explícita de
--    subtarefas e função complete_task.
--  * Projetos: prioridade, observações, marcos e histórico de status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tarefas
-- -----------------------------------------------------------------------------
alter table public.tasks
  add column description text not null default ''
    constraint tasks_description_length check (char_length(description) <= 4000),
  add column start_on date,
  add column category_id uuid,
  -- Primeira vez em que a tarefa entrou em andamento (análise de execução).
  add column started_at timestamptz,
  add column cancelled_at timestamptz;

comment on column public.tasks.notes is 'Observações livres (a descrição do que fazer fica em description).';

update public.tasks set cancelled_at = updated_at where status = 'cancelled' and cancelled_at is null;

alter table public.tasks
  add constraint tasks_dates_ordered check (due_on is null or start_on is null or due_on >= start_on),
  add constraint tasks_cancelled_consistent check ((status = 'cancelled') = (cancelled_at is not null)),
  add constraint tasks_category_fk foreign key (category_id, user_id)
    references public.activity_categories (id, user_id) on delete set null (category_id);

create index tasks_category_idx on public.tasks (category_id) where category_id is not null;

-- Datas de execução mantidas pelo servidor a partir do status:
--   done → completed_at; cancelled → cancelled_at; in_progress (1ª vez) → started_at.
create or replace function private.tasks_sync_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, pg_catalog.now());
    end if;
  else
    new.completed_at := null;
  end if;

  if new.status = 'cancelled' then
    if tg_op = 'INSERT' or old.status is distinct from 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, pg_catalog.now());
    end if;
  else
    new.cancelled_at := null;
  end if;

  if new.status in ('in_progress', 'done') and new.started_at is null then
    new.started_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

drop trigger tasks_sync_completion on public.tasks;
create trigger tasks_sync_completion before insert or update of status, completed_at, cancelled_at, started_at
  on public.tasks for each row execute function private.tasks_sync_completion();

-- Regras de conclusão (docs/data-model.md §9.2):
--   1. Uma tarefa só pode ser concluída quando todas as tarefas de que depende estão
--      concluídas ou canceladas (dependência BLOQUEIA; iniciar é permitido, com alerta).
--   2. Uma tarefa-mãe só pode ser concluída sem subtarefas abertas. A função
--      complete_task(id, true) conclui as subtarefas abertas na mesma transação — o
--      sistema nunca conclui a mãe sozinho.
create function private.tasks_enforce_completion_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pending text;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    select string_agg(t.title, ', ' order by t.title) into v_pending
      from public.task_dependencies d
      join public.tasks t on t.id = d.depends_on_task_id
     where d.task_id = new.id and t.status not in ('done', 'cancelled');
    if v_pending is not null then
      raise exception 'Conclua antes as tarefas de que esta depende: %', v_pending
        using errcode = '23514', constraint = 'tasks_dependencies_pending';
    end if;

    if exists (
      select 1 from public.tasks s
       where s.parent_task_id = new.id and s.status not in ('done', 'cancelled')
    ) then
      raise exception 'Há subtarefas abertas; conclua-as ou use "concluir com subtarefas"'
        using errcode = '23514', constraint = 'tasks_subtasks_pending';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_enforce_completion_rules before update of status on public.tasks
  for each row execute function private.tasks_enforce_completion_rules();

-- Cancelar uma tarefa-mãe cancela as subtarefas ainda abertas (regra explícita).
create function private.tasks_cascade_cancel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.tasks
     set status = 'cancelled'
   where parent_task_id = new.id and status in ('todo', 'in_progress');
  return null;
end;
$$;

create trigger tasks_cascade_cancel after update of status on public.tasks
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.parent_task_id is null)
  execute function private.tasks_cascade_cancel();

-- Conclui uma tarefa; com p_include_subtasks, conclui antes as subtarefas abertas.
create function public.complete_task(p_task_id uuid, p_include_subtasks boolean default false)
returns public.tasks
language plpgsql
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Tarefa não encontrada' using errcode = 'P0002';
  end if;
  if p_include_subtasks then
    update public.tasks set status = 'done'
     where parent_task_id = p_task_id and status in ('todo', 'in_progress');
  end if;
  update public.tasks set status = 'done' where id = p_task_id and status <> 'done'
  returning * into v_task;
  if v_task.id is null then
    select * into v_task from public.tasks where id = p_task_id;
  end if;
  return v_task;
end;
$$;

revoke all on function public.complete_task(uuid, boolean) from public, anon;
grant execute on function public.complete_task(uuid, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Projetos
-- -----------------------------------------------------------------------------
alter table public.projects
  add column priority text not null default 'medium'
    constraint projects_priority_valid check (priority in ('low', 'medium', 'high')),
  add column notes text not null default ''
    constraint projects_notes_length check (char_length(notes) <= 10000);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid not null,
  title text not null
    constraint project_milestones_title_length check (char_length(btrim(title)) between 1 and 200),
  due_on date,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_milestones_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index project_milestones_project_idx on public.project_milestones (project_id, sort_order);
create index project_milestones_user_idx on public.project_milestones (user_id);

select private.secure_owned_table('public.project_milestones');

-- Histórico de status (somente inclusão; o navegador não reescreve o passado).
create table public.project_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid not null,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_status_history_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade
);

create index project_status_history_project_idx on public.project_status_history (project_id, changed_at desc);
create index project_status_history_user_idx on public.project_status_history (user_id);

select private.secure_owned_table('public.project_status_history');
revoke update on table public.project_status_history from authenticated;

create function private.projects_log_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.project_status_history (user_id, project_id, from_status, to_status)
    values (new.user_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status);
  end if;
  return null;
end;
$$;

create trigger projects_log_status after insert or update of status on public.projects
  for each row execute function private.projects_log_status();

insert into public.project_status_history (user_id, project_id, from_status, to_status, changed_at)
select p.user_id, p.id, null, p.status, p.created_at from public.projects p;
