import type { DashboardSummary } from '@/types/domain';

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

export function buildDemoDashboard(now: Date): DashboardSummary {
  return {
    origin: 'demo',
    agenda: [
      {
        id: 'demo-ag-1',
        title: 'Estruturas de Dados — árvores AVL',
        kind: 'study',
        plannedStart: at(now, 0, 8, 30),
        plannedEnd: at(now, 0, 10, 0),
      },
      {
        id: 'demo-ag-2',
        title: 'Reunião do grupo de TCC',
        kind: 'event',
        plannedStart: at(now, 0, 14, 0),
        plannedEnd: at(now, 0, 15, 0),
      },
      {
        id: 'demo-ag-3',
        title: 'Revisar lista de Cálculo II',
        kind: 'task',
        plannedStart: at(now, 0, 16, 30),
        plannedEnd: at(now, 0, 17, 30),
      },
      {
        id: 'demo-ag-4',
        title: 'Leitura — 20 páginas',
        kind: 'habit',
        plannedStart: at(now, 0, 21, 0),
        plannedEnd: at(now, 0, 21, 30),
      },
    ],
    priorityTasks: [
      {
        id: 'demo-tk-1',
        title: 'Entregar capítulo 2 do TCC',
        priority: 'high',
        status: 'in_progress',
        dueAt: at(now, 2, 23, 59),
        projectName: 'TCC',
      },
      {
        id: 'demo-tk-2',
        title: 'Resolver exercícios 4.1 a 4.12',
        priority: 'high',
        status: 'todo',
        dueAt: at(now, 1, 18, 0),
        projectName: 'Cálculo II',
      },
      {
        id: 'demo-tk-3',
        title: 'Atualizar currículo',
        priority: 'medium',
        status: 'todo',
        dueAt: null,
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
        dueAt: at(now, 54, 23, 59),
      },
      {
        id: 'demo-gl-2',
        title: 'Ler 6 livros no ano',
        current: 4,
        target: 6,
        unit: 'livros',
        dueAt: null,
      },
    ],
    studies: {
      plannedMinutesToday: 150,
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
        dueAt: at(now, 0, 12, 0),
      },
      {
        id: 'demo-rv-2',
        topicName: 'Integrais por partes',
        subjectName: 'Cálculo II',
        dueAt: at(now, 1, 12, 0),
      },
      {
        id: 'demo-rv-3',
        topicName: 'Formas normais',
        subjectName: 'Banco de Dados',
        dueAt: at(now, 3, 12, 0),
      },
    ],
    recentActivities: [
      {
        id: 'demo-ac-1',
        title: 'Sessão de foco — árvores AVL',
        category: 'Estudo',
        startedAt: at(now, 0, 8, 35),
        durationMinutes: 52,
        source: 'timer',
      },
      {
        id: 'demo-ac-2',
        title: 'Caminhada',
        category: 'Saúde',
        startedAt: at(now, 0, 7, 0),
        durationMinutes: 30,
        source: 'manual',
      },
      {
        id: 'demo-ac-3',
        title: 'Sessão de foco — rotações',
        category: 'Estudo',
        startedAt: at(now, -1, 20, 10),
        durationMinutes: 33,
        source: 'timer',
      },
    ],
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
