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
    status: 'available',
    phase: 2,
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
    status: 'available',
    phase: 3,
    summary:
      'Mês, semana e dia com compromissos, blocos planejados, prazos, revisões e tempo realizado.',
    plannedCapabilities: [],
    connectsTo: ['tasks', 'studies', 'activities'],
    mobilePrimary: true,
  },
  {
    id: 'tasks',
    path: '/tarefas',
    label: 'Tarefas',
    icon: CheckSquare,
    group: 'plan',
    status: 'available',
    phase: 3,
    summary: 'Tarefas com prioridade, prazo, subtarefas, dependências e vínculo a projetos.',
    plannedCapabilities: [],
    connectsTo: ['projects', 'calendar', 'goals'],
    mobilePrimary: true,
  },
  {
    id: 'projects',
    path: '/projetos',
    label: 'Projetos',
    icon: FolderKanban,
    group: 'plan',
    status: 'available',
    phase: 3,
    summary: 'Resultados maiores com tarefas, marcos, histórico e progresso calculado.',
    plannedCapabilities: [],
    connectsTo: ['tasks', 'goals'],
  },
  {
    id: 'goals',
    path: '/metas',
    label: 'Metas',
    icon: Target,
    group: 'plan',
    status: 'available',
    phase: 3,
    summary:
      'Metas diárias, semanais, mensais ou de longo prazo, com progresso vindo dos registros.',
    plannedCapabilities: [],
    connectsTo: ['habits', 'studies', 'projects'],
  },
  {
    id: 'studies',
    path: '/estudos',
    label: 'Estudos',
    icon: BookOpen,
    group: 'execute',
    status: 'available',
    phase: 3,
    summary: 'Matérias, tópicos, sessões de foco com cronômetro confiável e revisões espaçadas.',
    plannedCapabilities: [],
    connectsTo: ['calendar', 'activities', 'goals'],
    mobilePrimary: true,
  },
  {
    id: 'habits',
    path: '/habitos',
    label: 'Hábitos',
    icon: Repeat,
    group: 'execute',
    status: 'available',
    phase: 3,
    summary: 'Hábitos com frequência flexível, marcação diária, sequências justas e consistência.',
    plannedCapabilities: [],
    connectsTo: ['goals', 'calendar'],
  },
  {
    id: 'activities',
    path: '/atividades',
    label: 'Atividades',
    icon: Timer,
    group: 'record',
    status: 'available',
    phase: 3,
    summary:
      'Registro do que realmente aconteceu: cronômetro ou lançamento manual, com métricas por tipo.',
    plannedCapabilities: [],
    connectsTo: ['studies', 'calendar', 'goals'],
  },
  {
    id: 'diary',
    path: '/diario',
    label: 'Diário',
    icon: NotebookPen,
    group: 'record',
    status: 'available',
    phase: 3,
    summary: 'Diário pessoal privado, com título opcional, humor, energia e busca.',
    plannedCapabilities: [],
    connectsTo: [],
  },
  {
    id: 'analytics',
    path: '/analises',
    label: 'Análises',
    icon: BarChart3,
    group: 'evaluate',
    status: 'available',
    phase: 4,
    summary:
      'Estatísticas de estudos, tarefas, metas, hábitos e atividades por período, com comparação e revisão semanal.',
    plannedCapabilities: [],
    connectsTo: ['activities', 'studies', 'goals'],
  },
  {
    id: 'recommendations',
    path: '/recomendacoes',
    label: 'Recomendações',
    icon: Sparkles,
    group: 'evaluate',
    status: 'available',
    phase: 4,
    summary:
      'Sugestões por regras explícitas, com motivo e dados de base; aceite, adie, rejeite ou resolva.',
    plannedCapabilities: [],
    connectsTo: ['analytics', 'calendar', 'studies'],
  },
  {
    id: 'settings',
    path: '/configuracoes',
    label: 'Configurações',
    icon: Settings,
    group: 'system',
    status: 'available',
    phase: 2,
    summary: 'Perfil, fuso horário, aparência, exportação dos dados e exclusão da conta.',
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
