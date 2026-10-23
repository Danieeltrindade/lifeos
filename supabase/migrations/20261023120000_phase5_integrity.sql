-- =============================================================================
-- Fase 5 · Integridade nas exclusões em cascata
--
-- Bug encontrado nos testes ponta a ponta: excluir uma MATÉRIA que tinha sessões ligadas a um
-- TÓPICO falhava (409, activities_topic_fk). Na mesma exclusão o Postgres apaga os tópicos (CASCADE)
-- e anula focus_sessions.subject_id (SET NULL); o trigger sessão → atividade, disparado por essa
-- anulação, copiava para a atividade o topic_id ANTIGO da sessão — de um tópico que acabara de ser
-- apagado — e a chave estrangeira recusava a exclusão inteira.
--
-- Correção: o trigger só copia referências que ainda existem. Quando a referência sumiu na própria
-- exclusão, a atividade fica sem ela (o mesmo efeito do SET NULL que viria logo em seguida).
-- Migrations já aplicadas não são reescritas; esta substitui apenas a função.
-- =============================================================================

create or replace function private.focus_sessions_sync_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_subject_name text;
  -- Referências ainda existentes (RLS: o dono enxerga as próprias linhas).
  v_subject_id uuid := (select s.id from public.subjects s where s.id = new.subject_id);
  v_topic_id uuid := (select t.id from public.topics t where t.id = new.topic_id);
  v_task_id uuid := (select t.id from public.tasks t where t.id = new.task_id);
begin
  if new.status <> 'completed' then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' then
    update public.activities
       set subject_id = v_subject_id,
           topic_id = v_topic_id,
           task_id = v_task_id,
           updated_at = pg_catalog.now()
     where session_id = new.id;
    return null;
  end if;

  select s.name into v_subject_name from public.subjects s where s.id = v_subject_id;
  insert into public.activities (user_id, title, session_id, started_at, ended_at, subject_id, topic_id, task_id)
  values (
    new.user_id,
    case when v_subject_name is null then 'Sessão de foco' else 'Sessão de foco — ' || v_subject_name end,
    new.id,
    new.started_at,
    new.ended_at,
    v_subject_id,
    v_topic_id,
    v_task_id
  );
  return null;
end;
$$;

comment on function private.focus_sessions_sync_activity() is
  'Sessão encerrada → atividade de estudo; mantém matéria/tópico/tarefa sincronizados, copiando só referências que ainda existem (exclusões em cascata).';
