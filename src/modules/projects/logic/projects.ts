/**
 * Progresso de projeto (RN-09, docs/data-model.md §9.3) — SEMPRE derivado, nunca digitado:
 *
 *   progresso = tarefas concluídas ÷ (tarefas do projeto − canceladas)
 *
 * Inclui subtarefas (herdam o projeto da mãe). Canceladas saem da conta: cancelar escopo não
 * é progresso nem atraso. Sem tarefas válidas, o progresso é DESCONHECIDO (null), não 0 %.
 * Marcos têm contagem própria e não entram nesse percentual.
 */
import type { ISODate } from '@/lib/date';
import type { Tables } from '@/services/supabase/database.types';

export type Project = Tables<'projects'>;
export type ProjectMilestone = Tables<'project_milestones'>;
export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: 'Planejado',
  active: 'Ativo',
  on_hold: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export interface ProjectProgress {
  done: number;
  /** Tarefas que contam (exclui canceladas). */
  total: number;
  open: number;
  cancelled: number;
  /** 0..1 ou null quando não há tarefas válidas. */
  ratio: number | null;
}

export function projectProgress(
  projectId: string,
  tasks: readonly Pick<Tables<'tasks'>, 'project_id' | 'status'>[],
): ProjectProgress {
  const own = tasks.filter((t) => t.project_id === projectId);
  const cancelled = own.filter((t) => t.status === 'cancelled').length;
  const done = own.filter((t) => t.status === 'done').length;
  const total = own.length - cancelled;
  return { done, total, open: total - done, cancelled, ratio: total === 0 ? null : done / total };
}

export function milestoneProgress(milestones: readonly ProjectMilestone[]): {
  done: number;
  total: number;
} {
  return {
    done: milestones.filter((m) => m.completed_at !== null).length,
    total: milestones.length,
  };
}

/** Projeto com prazo vencido e ainda não encerrado (destaque visual; status não muda). */
export function isProjectOverdue(
  project: Pick<Project, 'status' | 'due_on'>,
  today: ISODate,
): boolean {
  return (
    project.due_on !== null &&
    project.due_on < today &&
    project.status !== 'completed' &&
    project.status !== 'cancelled'
  );
}
