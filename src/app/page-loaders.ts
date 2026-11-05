/**
 * Carregadores das páginas carregadas sob demanda (code splitting). Fonte única usada pelas
 * rotas (module-routes.tsx) e pelo pré-carregamento dos testes de tela (tests/render-app.tsx).
 */
export const PAGE_LOADERS = {
  TasksPage: () => import('@/modules/tasks/TasksPage'),
  StudiesLayout: () => import('@/modules/studies/StudiesLayout'),
  SubjectsPage: () => import('@/modules/studies/SubjectsPage'),
  SubjectDetailPage: () => import('@/modules/studies/SubjectDetailPage'),
  TimerPage: () => import('@/modules/studies/TimerPage'),
  ReviewsPage: () => import('@/modules/studies/ReviewsPage'),
  ActivitiesPage: () => import('@/modules/activities/ActivitiesPage'),
  HabitsPage: () => import('@/modules/habits/HabitsPage'),
  GoalsPage: () => import('@/modules/goals/GoalsPage'),
  NotesPage: () => import('@/modules/notes/NotesPage'),
  NoteEditorPage: () => import('@/modules/notes/NoteEditorPage'),
  CalendarPage: () => import('@/modules/calendar/CalendarPage'),
  ProjectsPage: () => import('@/modules/projects/ProjectsPage'),
  PlannerPage: () => import('@/modules/planning/PlannerPage'),
  AnalyticsLayout: () => import('@/modules/analytics/AnalyticsLayout'),
  StudyAnalyticsPage: () => import('@/modules/analytics/StudyAnalyticsPage'),
  TaskAnalyticsPage: () => import('@/modules/analytics/TaskAnalyticsPage'),
  GoalsHabitsAnalyticsPage: () => import('@/modules/analytics/GoalsHabitsAnalyticsPage'),
  ActivityAnalyticsPage: () => import('@/modules/analytics/ActivityAnalyticsPage'),
  WeeklyReviewPage: () => import('@/modules/analytics/WeeklyReviewPage'),
  RecommendationsPage: () => import('@/modules/recommendations/RecommendationsPage'),
  ProjectDetailPage: () => import('@/modules/projects/ProjectDetailPage'),
} as const;

/** Importa todos os módulos de página (testes: tira o carregamento frio da espera do findBy). */
export function preloadAllPages(): Promise<unknown[]> {
  return Promise.all(Object.values(PAGE_LOADERS).map((load) => load()));
}
