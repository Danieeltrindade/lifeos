import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  NotebookPen,
  Repeat,
  Settings,
  Sparkles,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registro de módulos: FONTE ÚNICA de verdade para rotas, navegação e páginas introdutórias.
 * Sidebar, navegação móvel, roteador e testes derivam desta lista — não há rotas declaradas
 * em outro lugar. Adicionar um módulo aqui o torna navegável em todas as superfícies.
 */

export type ModuleId =
  | 'dashboard'
  | 'studies'
  | 'calendar'
  | 'tasks'
  | 'projects'
  | 'goals'
  | 'habits'
  | 'activities'
  | 'diary'
  | 'analytics'
  | 'recommendations'
  | 'settings';

/** Estado de implementação, exibido com honestidade na interface. */
export type ModuleStatus = 'available' | 'foundation' | 'planned';

export type NavGroupId = 'overview' | 'plan' | 'execute' | 'record' | 'evaluate' | 'system';

export interface ModuleDefinition {
  id: ModuleId;
  path: string;
  label: string;
  icon: LucideIcon;
  group: NavGroupId;
  status: ModuleStatus;
  /** Fase do roadmap (docs/product-specification.md) em que o módulo se torna funcional. */
  phase: number;
  summary: string;
  /** Capacidades previstas — mostradas na página introdutória, nunca como se já existissem. */
  plannedCapabilities: string[];
  /** Integrações com outros módulos, para explicar o encadeamento planejar → executar → avaliar. */
  connectsTo: ModuleId[];
  /** Exibido na barra inferior em telas pequenas. */
  mobilePrimary?: boolean;
}

export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'plan', label: 'Planejar' },
  { id: 'execute', label: 'Executar' },
  { id: 'record', label: 'Registrar' },
  { id: 'evaluate', label: 'Avaliar' },
  { id: 'system', label: 'Sistema' },
];

export const MODULES: ModuleDefinition[] = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    group: 'overview',
    status: 'foundation',
    phase: 1,
    summary: 'Visão consolidada do dia: agenda, prioridades, estudos, revisões e registros.',
    plannedCapabilities: [],
    connectsTo: [],
    mobilePrimary: true,
  },
  {
    id: 'calendar',
    path: '/calendario',
    label: 'Calendário',
    icon: CalendarDays,
    group: 'plan',
    status: 'planned',
    phase: 4,
    summary: 'Planejamento do tempo em blocos, com visão de dia, semana e mês.',
    plannedCapabilities: [
      'Blocos de tempo planejados para estudos, tarefas e compromissos',
      'Arrastar para reagendar e redimensionar blocos',
      'Comparação entre o bloco planejado e o tempo efetivamente registrado',
      'Visões de dia, semana e mês adaptadas ao celular',
    ],
    connectsTo: ['tasks', 'studies', 'activities'],
    mobilePrimary: true,
  },
  {
    id: 'tasks',
    path: '/tarefas',
    label: 'Tarefas',
    icon: CheckSquare,
    group: 'plan',
    status: 'planned',
    phase: 3,
    summary: 'Tarefas com prioridade, prazo, subtarefas e vínculo opcional a projetos.',
    plannedCapabilities: [
      'Criar, editar, concluir e cancelar tarefas',
      'Subtarefas com progresso derivado',
      'Prioridade, prazo e estimativa de esforço (estimativa ≠ tempo real)',
      'Filtros por projeto, prazo e status',
    ],
    connectsTo: ['projects', 'calendar', 'goals'],
    mobilePrimary: true,
  },
  {
    id: 'projects',
    path: '/projetos',
    label: 'Projetos',
    icon: FolderKanban,
    group: 'plan',
    status: 'planned',
    phase: 3,
    summary: 'Agrupamento de tarefas em torno de um resultado com início e fim.',
    plannedCapabilities: [
      'Projetos com objetivo, prazo e status',
      'Progresso calculado a partir das tarefas concluídas',
      'Histórico de tempo dedicado por projeto',
    ],
    connectsTo: ['tasks', 'goals'],
  },
  {
    id: 'goals',
    path: '/metas',
    label: 'Metas',
    icon: Target,
    group: 'plan',
    status: 'planned',
    phase: 5,
    summary: 'Metas mensuráveis com progresso alimentado por registros reais.',
    plannedCapabilities: [
      'Metas com unidade, alvo e prazo',
      'Progresso automático a partir de sessões, tarefas e hábitos',
      'Progresso manual quando não houver fonte automática, sinalizado como tal',
    ],
    connectsTo: ['habits', 'studies', 'projects'],
  },
  {
    id: 'studies',
    path: '/estudos',
    label: 'Estudos',
    icon: BookOpen,
    group: 'execute',
    status: 'planned',
    phase: 2,
    summary: 'Matérias, tópicos, sessões de foco com cronômetro confiável e revisões.',
    plannedCapabilities: [
      'Matérias e tópicos organizados por período',
      'Cronômetro com pausas, resistente a recarregar a página e trocar de aba',
      'Sessões registradas com tempo líquido (pausas descontadas)',
      'Agenda de revisões espaçadas por tópico',
    ],
    connectsTo: ['calendar', 'activities', 'goals'],
    mobilePrimary: true,
  },
  {
    id: 'habits',
    path: '/habitos',
    label: 'Hábitos',
    icon: Repeat,
    group: 'execute',
    status: 'planned',
    phase: 5,
    summary: 'Hábitos recorrentes com marcação diária e histórico de consistência.',
    plannedCapabilities: [
      'Hábitos com frequência configurável (diária, dias da semana, X vezes por semana)',
      'Marcação rápida e histórico',
      'Sequências calculadas a partir dos registros, sem ajustes manuais ocultos',
    ],
    connectsTo: ['goals', 'calendar'],
  },
  {
    id: 'activities',
    path: '/atividades',
    label: 'Atividades',
    icon: Timer,
    group: 'record',
    status: 'planned',
    phase: 2,
    summary: 'Registro do que realmente aconteceu: por cronômetro ou lançamento manual.',
    plannedCapabilities: [
      'Lançamento manual com início, fim e categoria',
      'Registros gerados automaticamente pelas sessões de foco',
      'Origem de cada registro sempre visível (cronômetro ou manual)',
    ],
    connectsTo: ['studies', 'calendar', 'analytics'],
  },
  {
    id: 'diary',
    path: '/diario',
    label: 'Diário',
    icon: NotebookPen,
    group: 'record',
    status: 'planned',
    phase: 5,
    summary: 'Diário pessoal privado, com reflexões diárias e marcação de humor e energia.',
    plannedCapabilities: [
      'Uma entrada por dia, com edição posterior',
      'Escala de humor e energia opcional',
      'Privacidade reforçada: visível apenas para o próprio usuário',
    ],
    connectsTo: ['analytics'],
  },
  {
    id: 'analytics',
    path: '/analises',
    label: 'Análises',
    icon: BarChart3,
    group: 'evaluate',
    status: 'planned',
    phase: 6,
    summary: 'Relatórios de planejado versus realizado, tempo por área e evolução.',
    plannedCapabilities: [
      'Planejado × realizado por dia, semana e mês',
      'Tempo por matéria, projeto e categoria',
      'Gráficos legíveis em telas estreitas, com tabela equivalente acessível',
    ],
    connectsTo: ['activities', 'studies', 'goals'],
  },
  {
    id: 'recommendations',
    path: '/recomendacoes',
    label: 'Recomendações',
    icon: Sparkles,
    group: 'evaluate',
    status: 'planned',
    phase: 7,
    summary: 'Sugestões adaptativas baseadas no seu histórico, sempre com justificativa.',
    plannedCapabilities: [
      'Regras explicáveis antes de qualquer modelo estatístico',
      'Cada sugestão mostra em quais registros se baseia',
      'Possibilidade de dispensar e avaliar sugestões',
      'Nenhuma recomendação sem histórico suficiente',
    ],
    connectsTo: ['analytics', 'calendar', 'studies'],
  },
  {
    id: 'settings',
    path: '/configuracoes',
    label: 'Configurações',
    icon: Settings,
    group: 'system',
    status: 'foundation',
    phase: 1,
    summary: 'Aparência, preferências e, futuramente, perfil e conta.',
    plannedCapabilities: [],
    connectsTo: [],
  },
];

export function getModule(id: ModuleId): ModuleDefinition {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Módulo desconhecido: ${id}`);
  return found;
}

export const STATUS_LABELS: Record<ModuleStatus, string> = {
  available: 'Disponível',
  foundation: 'Primeira versão',
  planned: 'Em desenvolvimento',
};
