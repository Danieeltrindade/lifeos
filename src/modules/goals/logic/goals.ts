/**
 * Apresentação de metas. O VALOR vem do banco (public.goal_progress), calculado dos registros
 * reais no ciclo atual — editar a meta não reescreve o histórico (docs/data-model.md §9.5).
 */
import type { Tables } from '@/services/supabase/database.types';

export type Goal = Tables<'goals'>;
export type GoalMode =
  | 'manual'
  | 'activity_time'
  | 'study_sessions'
  | 'questions'
  | 'pages'
  | 'tasks_completed'
  | 'habit_checkins';
export type GoalPeriod = 'once' | 'daily' | 'weekly' | 'monthly';

export const MODE_LABELS: Record<GoalMode, { label: string; source: string; unit: string | null }> =
  {
    activity_time: { label: 'Horas', source: 'Soma do tempo das atividades', unit: 'h' },
    study_sessions: {
      label: 'Sessões de estudo',
      source: 'Sessões de foco concluídas',
      unit: 'sessões',
    },
    questions: { label: 'Questões', source: 'Questões informadas nas reflexões', unit: 'questões' },
    pages: { label: 'Páginas', source: 'Páginas das atividades de leitura', unit: 'páginas' },
    tasks_completed: {
      label: 'Tarefas concluídas',
      source: 'Tarefas marcadas como concluídas',
      unit: 'tarefas',
    },
    habit_checkins: { label: 'Hábito', source: 'Dias em que o hábito foi cumprido', unit: 'vezes' },
    manual: { label: 'Valor manual', source: 'Lançamentos que você registra', unit: null },
  };

export const PERIOD_LABELS: Record<GoalPeriod, string> = {
  once: 'Até o prazo',
  daily: 'Por dia',
  weekly: 'Por semana',
  monthly: 'Por mês',
};

export function goalRatio(current: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, current / target);
}

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** "12,5 h", "3 sessões". Horas viram "2 h 30 min" quando fracionárias e pequenas. */
export function formatGoalValue(value: number, unit: string): string {
  if (unit === 'h' && value > 0 && value < 100 && !Number.isInteger(value)) {
    const totalMinutes = Math.round(value * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h === 0 ? `${String(m)} min` : `${String(h)} h ${String(m)} min`;
  }
  return `${numberFormat.format(value)} ${value === 1 ? (SINGULAR[unit] ?? unit) : unit}`;
}

/** Concordância das unidades canônicas (“1 sessão”, não “1 sessões”). */
const SINGULAR: Partial<Record<string, string>> = {
  sessões: 'sessão',
  questões: 'questão',
  páginas: 'página',
  tarefas: 'tarefa',
  vezes: 'vez',
};
