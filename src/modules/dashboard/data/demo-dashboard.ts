import { addDays, browserTimeZone, localDateIn } from '@/lib/date';
import type { AgendaItem, DashboardSummary } from '@/types/domain';

/**
 * DADOS DE DEMONSTRAÇÃO — FICTÍCIOS.
 *
 * Existem apenas para avaliar o design do dashboard antes da integração com o backend.
 * Todo resumo gerado aqui tem `origin: 'demo'`, e a interface exibe um aviso explícito.
 * Nada neste arquivo pode ser importado por repositórios reais.
 */
function at(base: Date, dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, minute);
  return d.toISOString();
}

/** Agenda fictícia (no modo real, a agenda vem do calendário, montada na interface). */
export function buildDemoAgenda(now: Date): AgendaItem[] {
  return [
    {
      id: 'demo-ag-1',
      title: 'Estruturas de Dados — árvores AVL',
      kind: 'study',
      allDay: false,
      plannedStart: at(now, 0, 8, 30),
      plannedEnd: at(now, 0, 10, 0),
    },
    {
      id: 'demo-ag-2',
      title: 'Reunião do grupo de TCC',
      kind: 'event',
      allDay: false,
      plannedStart: at(now, 0, 14, 0),
      plannedEnd: at(now, 0, 15, 0),
    },
    {
      id: 'demo-ag-3',
      title: 'Revisar lista de Cálculo II',
      kind: 'task',
      allDay: false,
      plannedStart: at(now, 0, 16, 30),
      plannedEnd: at(now, 0, 17, 30),
    },
    {
      id: 'demo-ag-4',
      title: 'Leitura — 20 páginas',
      kind: 'habit',
      allDay: false,
      plannedStart: at(now, 0, 21, 0),
      plannedEnd: at(now, 0, 21, 30),
    },
  ];
}

export function buildDemoDashboard(now: Date): DashboardSummary {
  const timezone = browserTimeZone();
  const today = localDateIn(now, timezone);
  return {
    origin: 'demo',
    timezone,
    localDate: today,
    priorityTasks: [
      {
        id: 'demo-tk-1',
        title: 'Entregar capítulo 2 do TCC',
        priority: 'high',
        status: 'in_progress',
        dueOn: addDays(today, 2),
        projectName: 'TCC',
      },
      {
        id: 'demo-tk-2',
        title: 'Resolver exercícios 4.1 a 4.12',
        priority: 'high',
        status: 'todo',
        dueOn: addDays(today, 1),
        projectName: 'Cálculo II',
      },
      {
        id: 'demo-tk-3',
        title: 'Atualizar currículo',
        priority: 'medium',
        status: 'todo',
        dueOn: null,
        projectName: null,
      },
    ],
    goals: [
      {
        id: 'demo-gl-1',
        title: 'Estudar 60 h no semestre',
        current: 23,
        target: 60,
        unit: 'h',
        dueOn: addDays(today, 54),
        progressMode: 'activity_time',
        period: 'once',
        cycleStart: addDays(today, -60),
        cycleEnd: addDays(today, 55),
      },
      {
        id: 'demo-gl-2',
        title: 'Ler 6 livros no ano',
        current: 4,
        target: 6,
        unit: 'livros',
        dueOn: null,
        progressMode: 'manual',
        period: 'once',
        cycleStart: addDays(today, -200),
        cycleEnd: addDays(today, 1),
      },
      {
        id: 'demo-gl-3',
        title: '5 sessões de foco na semana',
        current: 3,
        target: 5,
        unit: 'sessões',
        dueOn: null,
        progressMode: 'study_sessions',
        period: 'weekly',
        cycleStart: addDays(today, -2),
        cycleEnd: addDays(today, 5),
      },
    ],
    studies: {
      actualMinutesToday: 85,
      actualMinutesLast7Days: 612,
      sessionsToday: 2,
      topSubjectsLast7Days: [
        { subjectId: 'demo-sb-1', subjectName: 'Estruturas de Dados', actualMinutes: 245 },
        { subjectId: 'demo-sb-2', subjectName: 'Cálculo II', actualMinutes: 198 },
        { subjectId: 'demo-sb-3', subjectName: 'Banco de Dados', actualMinutes: 169 },
      ],
    },
    reviews: [
      {
        id: 'demo-rv-1',
        topicName: 'Complexidade assintótica',
        subjectName: 'Estruturas de Dados',
        dueOn: today,
        priority: 'high',
      },
      {
        id: 'demo-rv-2',
        topicName: 'Integrais por partes',
        subjectName: 'Cálculo II',
        dueOn: addDays(today, 1),
        priority: 'medium',
      },
      {
        id: 'demo-rv-3',
        topicName: 'Formas normais',
        subjectName: 'Banco de Dados',
        dueOn: addDays(today, 3),
        priority: 'low',
      },
    ],
    reviewCounts: { overdue: 0, dueToday: 1 },
    recentActivities: [
      {
        id: 'demo-ac-1',
        title: 'Sessão de foco — árvores AVL',
        category: 'Estudo',
        kind: 'study',
        startedAt: at(now, 0, 8, 35),
        durationMinutes: 52,
        source: 'timer',
      },
      {
        id: 'demo-ac-2',
        title: 'Caminhada',
        category: 'Saúde',
        kind: 'exercise',
        startedAt: at(now, 0, 7, 0),
        durationMinutes: 30,
        source: 'manual',
      },
      {
        id: 'demo-ac-3',
        title: 'Sessão de foco — rotações',
        category: 'Estudo',
        kind: 'study',
        startedAt: at(now, -1, 20, 10),
        durationMinutes: 33,
        source: 'timer',
      },
    ],
    activeProjects: [
      {
        id: 'demo-pj-1',
        name: 'TCC',
        dueOn: addDays(today, 40),
        priority: 'high',
        tasksTotal: 12,
        tasksDone: 5,
      },
    ],
    setup: { subjects: 3, tasks: 8, habits: 2, goals: 3, activities: 40, events: 6 },
    recommendations: [
      {
        id: 'demo-rc-1',
        title: 'Antecipe a revisão de Complexidade assintótica',
        rationale:
          'Exemplo fictício: a revisão vence hoje e há um intervalo livre entre 10h e 14h na agenda.',
      },
    ],
  };
}
