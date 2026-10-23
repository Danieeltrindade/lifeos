/**
 * Domínios de dados e o que cada mudança invalida.
 *
 * Toda leitura usa uma chave que começa pelo seu domínio (ex.: ['tasks', 'list']).
 * Uma escrita declara os domínios que ALTERA; o mapa abaixo expande para todos os que
 * DEPENDEM dela — assim editar uma tarefa atualiza projetos, metas, calendário e dashboard
 * sem que cada tela precise saber disso. É a regra de "estatísticas sempre coerentes".
 */
export type DataDomain =
  | 'tasks'
  | 'projects'
  | 'subjects'
  | 'sessions'
  | 'reviews'
  | 'activities'
  | 'goals'
  | 'habits'
  | 'diary'
  | 'calendar'
  | 'categories'
  | 'dashboard'
  /** Estatísticas agregadas no banco (public.stats_*). */
  | 'stats'
  /** Recomendações persistidas (estado, adiamento, histórico). */
  | 'recommendations'
  /** Disponibilidade e preferências de planejamento. */
  | 'planning'
  /** Revisões semanais (anotações e prioridades). */
  | 'weeklyReviews';

const DEPENDENTS: Record<DataDomain, DataDomain[]> = {
  // Tarefas concluídas alimentam metas e o progresso de projetos.
  tasks: ['projects', 'goals', 'calendar', 'dashboard', 'stats'],
  projects: ['tasks', 'goals', 'activities', 'dashboard', 'stats'],
  // Matérias/tópicos aparecem em sessões, revisões, atividades e metas.
  subjects: ['sessions', 'reviews', 'activities', 'goals', 'calendar', 'dashboard', 'stats'],
  // Sessões geram atividades (banco), domínio de tópicos, revisões e metas.
  sessions: ['activities', 'subjects', 'reviews', 'goals', 'calendar', 'dashboard', 'stats'],
  reviews: ['subjects', 'calendar', 'dashboard', 'stats'],
  activities: ['sessions', 'goals', 'projects', 'calendar', 'dashboard', 'stats'],
  goals: ['dashboard', 'stats'],
  habits: ['goals', 'dashboard', 'stats'],
  diary: [],
  calendar: ['dashboard', 'stats'],
  categories: ['activities', 'tasks', 'goals', 'dashboard', 'stats'],
  dashboard: [],
  stats: [],
  recommendations: ['dashboard'],
  planning: [],
  weeklyReviews: [],
};

export function affectedDomains(changed: readonly DataDomain[]): DataDomain[] {
  const out = new Set<DataDomain>();
  for (const d of changed) {
    out.add(d);
    for (const dep of DEPENDENTS[d]) out.add(dep);
  }
  return [...out];
}
