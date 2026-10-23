/**
 * Tipos de domínio compartilhados entre módulos (contratos de leitura da interface).
 * O modelo relacional está em docs/data-model.md; os tipos das tabelas são gerados em
 * services/supabase/database.types.ts. Estes são as PROJEÇÕES que a interface consome —
 * as respostas do banco são validadas com Zod antes de virarem estes tipos.
 *
 * Convenções:
 *  - IDs são UUID (string).
 *  - Instantes são ISO 8601 com fuso (ISODateTime); a interface os exibe no fuso do PERFIL.
 *  - Datas de calendário (prazos, revisões) são ISODate "AAAA-MM-DD" e não têm fuso.
 *  - Durações são minutos inteiros.
 *  - "planned*" = intenção/estimativa; "actual*" = fato registrado. Nunca se misturam.
 */

export type ISODateTime = string;
/** "AAAA-MM-DD" */
export type ISODate = string;
export type UUID = string;

/** Origem de um dado exibido. Dados "demo" nunca podem ser apresentados como pessoais. */
export type DataOrigin = 'user' | 'demo';

export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export type AgendaItemKind = 'study' | 'task' | 'event' | 'habit';

/**
 * Item da agenda do dia. Montado NA INTERFACE a partir do calendário (mesma expansão de
 * recorrências da tela de calendário), não pelo resumo do servidor.
 */
export interface AgendaItem {
  /** Evento + ocorrência (eventos recorrentes geram vários itens). */
  id: string;
  title: string;
  kind: AgendaItemKind;
  /** Evento de dia inteiro: plannedStart/plannedEnd são os limites do dia local. */
  allDay: boolean;
  plannedStart: ISODateTime;
  plannedEnd: ISODateTime;
}

export interface TaskSummary {
  id: UUID;
  title: string;
  priority: Priority;
  status: TaskStatus;
  dueOn: ISODate | null;
  projectName: string | null;
}

/** manual = informado pelo usuário; os demais são derivados de registros (RN-10). */
export type GoalProgressMode =
  | 'manual'
  | 'activity_time'
  | 'study_sessions'
  | 'questions'
  | 'pages'
  | 'tasks_completed'
  | 'habit_checkins';

export type GoalPeriod = 'once' | 'daily' | 'weekly' | 'monthly';

export interface GoalProgress {
  id: UUID;
  title: string;
  current: number;
  target: number;
  unit: string;
  dueOn: ISODate | null;
  progressMode: GoalProgressMode;
  period: GoalPeriod;
  /** Ciclo atual [cycleStart, cycleEnd) em datas locais. */
  cycleStart: ISODate;
  cycleEnd: ISODate;
}

export interface SubjectTime {
  subjectId: UUID;
  subjectName: string;
  actualMinutes: number;
}

export interface StudySummary {
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
  dueOn: ISODate;
  priority: Priority;
}

export type ActivitySource = 'timer' | 'manual';

export interface ActivityEntry {
  id: UUID;
  title: string;
  category: string | null;
  kind: string;
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

export interface ProjectSummary {
  id: UUID;
  name: string;
  dueOn: ISODate | null;
  priority: Priority;
  tasksTotal: number;
  tasksDone: number;
}

/** Contagens para adaptar o dashboard de quem está começando. */
export interface SetupCounts {
  subjects: number;
  tasks: number;
  habits: number;
  goals: number;
  activities: number;
  events: number;
}

export interface DashboardSummary {
  origin: DataOrigin;
  /** Fuso IANA em que o resumo foi calculado (o do perfil). */
  timezone: string;
  /** "Hoje" no fuso do perfil. */
  localDate: ISODate;
  priorityTasks: TaskSummary[];
  goals: GoalProgress[];
  studies: StudySummary;
  reviews: ReviewItem[];
  reviewCounts: { overdue: number; dueToday: number };
  recentActivities: ActivityEntry[];
  activeProjects: ProjectSummary[];
  recommendations: Recommendation[];
  setup: SetupCounts;
}
