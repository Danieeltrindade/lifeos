/**
 * Tipos de domínio compartilhados entre módulos (contratos de leitura da interface).
 * O modelo relacional completo está em docs/data-model.md; estes tipos são projeções
 * usadas pela interface e serão gerados/validados a partir do schema do Supabase na Fase 2.
 *
 * Convenções:
 *  - IDs são UUID (string).
 *  - Datas/horas são ISO 8601 em UTC (string); a interface converte para o fuso do usuário.
 *  - Durações são minutos inteiros.
 *  - "planned*" = intenção/estimativa; "actual*" = fato registrado. Nunca se misturam.
 */

export type ISODateTime = string;
export type UUID = string;

/** Origem de um dado exibido. Dados "demo" nunca podem ser apresentados como pessoais. */
export type DataOrigin = 'user' | 'demo';

export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export type AgendaItemKind = 'study' | 'task' | 'event' | 'habit';

export interface AgendaItem {
  id: UUID;
  title: string;
  kind: AgendaItemKind;
  plannedStart: ISODateTime;
  plannedEnd: ISODateTime;
}

export interface TaskSummary {
  id: UUID;
  title: string;
  priority: Priority;
  status: TaskStatus;
  dueAt: ISODateTime | null;
  projectName: string | null;
}

export interface GoalProgress {
  id: UUID;
  title: string;
  current: number;
  target: number;
  unit: string;
  dueAt: ISODateTime | null;
}

export interface SubjectTime {
  subjectId: UUID;
  subjectName: string;
  actualMinutes: number;
}

export interface StudySummary {
  /** Minutos planejados para hoje (blocos de estudo no calendário). */
  plannedMinutesToday: number;
  /** Minutos efetivamente registrados hoje (sessões encerradas, pausas descontadas). */
  actualMinutesToday: number;
  actualMinutesLast7Days: number;
  sessionsToday: number;
  topSubjectsLast7Days: SubjectTime[];
}

export interface ReviewItem {
  id: UUID;
  topicName: string;
  subjectName: string;
  dueAt: ISODateTime;
}

export type ActivitySource = 'timer' | 'manual';

export interface ActivityEntry {
  id: UUID;
  title: string;
  category: string;
  startedAt: ISODateTime;
  durationMinutes: number;
  source: ActivitySource;
}

export interface Recommendation {
  id: UUID;
  title: string;
  /** Explicação legível do porquê — recomendações sem justificativa não são exibidas. */
  rationale: string;
}

export interface DashboardSummary {
  origin: DataOrigin;
  agenda: AgendaItem[];
  priorityTasks: TaskSummary[];
  goals: GoalProgress[];
  studies: StudySummary;
  reviews: ReviewItem[];
  recentActivities: ActivityEntry[];
  recommendations: Recommendation[];
}
