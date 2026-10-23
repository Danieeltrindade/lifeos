-- =============================================================================
-- LifeOS · 002 · Planejamento: projetos, tarefas, subtarefas e dependências
--
-- Integridade entre contas: tabelas-pai expõem UNIQUE (id, user_id) e as filhas
-- referenciam (fk, user_id). Assim é impossível ligar um registro próprio a um
-- registro de outra pessoa, mesmo conhecendo o UUID (RN-01).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Projetos
-- -----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null
    constraint projects_name_length check (char_length(btrim(name)) between 1 and 120),
  description text not null default ''
    constraint projects_description_length check (char_length(description) <= 4000),
  status text not null default 'active'
    constraint projects_status_valid check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  start_on date,
  due_on date,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_unique unique (id, user_id),
  constraint projects_dates_ordered check (due_on is null or start_on is null or due_on >= start_on),
  constraint projects_completed_consistent check ((status = 'completed') = (completed_at is not null))
);

comment on table public.projects is
  'Agrupa tarefas em torno de um resultado. Progresso é derivado das tarefas (RN-09), nunca armazenado.';

create index projects_user_idx on public.projects (user_id);
create index projects_user_active_idx on public.projects (user_id, status) where archived_at is null;

select private.secure_owned_table('public.projects');

-- -----------------------------------------------------------------------------
-- Tarefas e subtarefas (um nível)
-- -----------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  project_id uuid,
  parent_task_id uuid,
  title text not null
    constraint tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  notes text not null default ''
    constraint tasks_notes_length check (char_length(notes) <= 10000),
  status text not null default 'todo'
    constraint tasks_status_valid check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium'
    constraint tasks_priority_valid check (priority in ('low', 'medium', 'high')),
  -- Prazo é uma data do calendário do usuário (sem horário). Compromissos com hora
  -- marcada são eventos do calendário.
  due_on date,
  -- Estimativa é PLANEJAMENTO (RN-02): nunca é somada como tempo realizado.
  estimate_minutes integer
    constraint tasks_estimate_range check (estimate_minutes between 1 and 10080),
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_id_user_unique unique (id, user_id),
  constraint tasks_not_own_parent check (parent_task_id is distinct from id),
  constraint tasks_completed_consistent check ((status = 'done') = (completed_at is not null)),
  constraint tasks_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete set null (project_id),
  constraint tasks_parent_fk foreign key (parent_task_id, user_id)
    references public.tasks (id, user_id) on delete cascade
);

comment on column public.tasks.estimate_minutes is 'Estimativa (planejado). Tempo realizado vem de activities.';

create index tasks_user_idx on public.tasks (user_id);
create index tasks_user_open_idx on public.tasks (user_id, due_on, priority)
  where status in ('todo', 'in_progress');
create index tasks_project_idx on public.tasks (project_id) where project_id is not null;
create index tasks_parent_idx on public.tasks (parent_task_id) where parent_task_id is not null;

select private.secure_owned_table('public.tasks');

-- completed_at é mantido pelo servidor a partir do status.
create function private.tasks_sync_completion()
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
  return new;
end;
$$;

create trigger tasks_sync_completion before insert or update of status, completed_at on public.tasks
  for each row execute function private.tasks_sync_completion();

-- Subtarefas: um único nível e mesmo projeto da tarefa-mãe.
create function private.tasks_enforce_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.tasks%rowtype;
begin
  if new.parent_task_id is not null then
    select * into v_parent from public.tasks where id = new.parent_task_id;
    -- Mãe inexistente/alheia: a FK composta rejeita logo em seguida.
    if found then
      if v_parent.parent_task_id is not null then
        raise exception 'Subtarefas não podem ter subtarefas'
          using errcode = '23514', constraint = 'tasks_single_level';
      end if;
      new.project_id := v_parent.project_id;
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.tasks t where t.parent_task_id = new.id) then
      raise exception 'Uma tarefa com subtarefas não pode virar subtarefa'
        using errcode = '23514', constraint = 'tasks_single_level';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_enforce_hierarchy before insert or update of parent_task_id, project_id on public.tasks
  for each row execute function private.tasks_enforce_hierarchy();

-- Ao mover uma tarefa-mãe de projeto, as subtarefas acompanham.
create function private.tasks_propagate_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.tasks
     set project_id = new.project_id
   where parent_task_id = new.id
     and project_id is distinct from new.project_id;
  return null;
end;
$$;

create trigger tasks_propagate_project after update of project_id on public.tasks
  for each row
  when (new.parent_task_id is null and old.project_id is distinct from new.project_id)
  execute function private.tasks_propagate_project();

-- Projetos: completed_at mantido pelo servidor.
create function private.projects_sync_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := coalesce(new.completed_at, pg_catalog.now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger projects_sync_completion before insert or update of status, completed_at on public.projects
  for each row execute function private.projects_sync_completion();

-- -----------------------------------------------------------------------------
-- Dependências entre tarefas (grafo acíclico)
-- -----------------------------------------------------------------------------
create table public.task_dependencies (
  task_id uuid not null,
  depends_on_task_id uuid not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  constraint task_dependencies_not_self check (task_id <> depends_on_task_id),
  constraint task_dependencies_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade,
  constraint task_dependencies_depends_on_fk foreign key (depends_on_task_id, user_id)
    references public.tasks (id, user_id) on delete cascade
);

comment on table public.task_dependencies is 'task_id só pode ser concluída depois de depends_on_task_id.';

create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_task_id);
create index task_dependencies_user_idx on public.task_dependencies (user_id);

select private.secure_owned_table('public.task_dependencies');

create function private.task_dependencies_prevent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Existe caminho depends_on -> ... -> task? Então a nova aresta fecharia um ciclo.
  if exists (
    with recursive reachable(id) as (
      select d.depends_on_task_id from public.task_dependencies d where d.task_id = new.depends_on_task_id
      union
      select d.depends_on_task_id from public.task_dependencies d join reachable r on d.task_id = r.id
    )
    select 1 from reachable where id = new.task_id
  ) then
    raise exception 'Dependência circular entre tarefas'
      using errcode = '23514', constraint = 'task_dependencies_acyclic';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_prevent_cycle before insert or update on public.task_dependencies
  for each row execute function private.task_dependencies_prevent_cycle();
