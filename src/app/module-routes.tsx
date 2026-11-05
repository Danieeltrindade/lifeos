import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteObject } from 'react-router';
import { PageFallback } from '@/components/layout/PageFallback';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import type { ModuleId } from './modules';
import { PAGE_LOADERS } from './page-loaders';

/**
 * Rotas de cada módulo implementado. Os módulos grandes são carregados sob demanda
 * (code splitting): o pacote inicial fica menor e cada tela baixa só o que usa
 * (o calendário, por exemplo, traz o FullCalendar).
 */
function page<T extends Record<string, ComponentType>>(
  loader: () => Promise<T>,
  name: keyof T,
): LazyExoticComponent<ComponentType> {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

const TasksPage = page(PAGE_LOADERS.TasksPage, 'TasksPage');
const StudiesLayout = page(PAGE_LOADERS.StudiesLayout, 'StudiesLayout');
const SubjectsPage = page(PAGE_LOADERS.SubjectsPage, 'SubjectsPage');
const SubjectDetailPage = page(PAGE_LOADERS.SubjectDetailPage, 'SubjectDetailPage');
const TimerPage = page(PAGE_LOADERS.TimerPage, 'TimerPage');
const ReviewsPage = page(PAGE_LOADERS.ReviewsPage, 'ReviewsPage');
const ActivitiesPage = page(PAGE_LOADERS.ActivitiesPage, 'ActivitiesPage');
const HabitsPage = page(PAGE_LOADERS.HabitsPage, 'HabitsPage');
const GoalsPage = page(PAGE_LOADERS.GoalsPage, 'GoalsPage');
const NotesPage = page(PAGE_LOADERS.NotesPage, 'NotesPage');
const NoteEditorPage = page(PAGE_LOADERS.NoteEditorPage, 'NoteEditorPage');
const CalendarPage = page(PAGE_LOADERS.CalendarPage, 'CalendarPage');
const ProjectsPage = page(PAGE_LOADERS.ProjectsPage, 'ProjectsPage');
const PlannerPage = page(PAGE_LOADERS.PlannerPage, 'PlannerPage');
const AnalyticsLayout = page(PAGE_LOADERS.AnalyticsLayout, 'AnalyticsLayout');
const StudyAnalyticsPage = page(PAGE_LOADERS.StudyAnalyticsPage, 'StudyAnalyticsPage');
const TaskAnalyticsPage = page(PAGE_LOADERS.TaskAnalyticsPage, 'TaskAnalyticsPage');
const GoalsHabitsAnalyticsPage = page(
  PAGE_LOADERS.GoalsHabitsAnalyticsPage,
  'GoalsHabitsAnalyticsPage',
);
const ActivityAnalyticsPage = page(PAGE_LOADERS.ActivityAnalyticsPage, 'ActivityAnalyticsPage');
const WeeklyReviewPage = page(PAGE_LOADERS.WeeklyReviewPage, 'WeeklyReviewPage');
const RecommendationsPage = page(PAGE_LOADERS.RecommendationsPage, 'RecommendationsPage');
const ProjectDetailPage = page(PAGE_LOADERS.ProjectDetailPage, 'ProjectDetailPage');

function withSuspense(Component: ComponentType) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

/** Rotas filhas de cada módulo (relativas ao caminho do módulo). */
export const MODULE_ROUTES: Partial<Record<ModuleId, RouteObject[]>> = {
  dashboard: [{ index: true, element: <DashboardPage /> }],
  settings: [{ index: true, element: <SettingsPage /> }],
  tasks: [{ index: true, element: withSuspense(TasksPage) }],
  studies: [
    {
      element: withSuspense(StudiesLayout),
      children: [
        { index: true, element: withSuspense(SubjectsPage) },
        { path: 'materias/:subjectId', element: withSuspense(SubjectDetailPage) },
        { path: 'cronometro', element: withSuspense(TimerPage) },
        { path: 'revisoes', element: withSuspense(ReviewsPage) },
      ],
    },
  ],
  activities: [{ index: true, element: withSuspense(ActivitiesPage) }],
  habits: [{ index: true, element: withSuspense(HabitsPage) }],
  goals: [{ index: true, element: withSuspense(GoalsPage) }],
  notes: [
    { index: true, element: withSuspense(NotesPage) },
    // ":noteId" também atende "/notas/nova" (ver NoteEditorPage).
    { path: ':noteId', element: withSuspense(NoteEditorPage) },
  ],
  calendar: [
    { index: true, element: withSuspense(CalendarPage) },
    { path: 'planejar', element: withSuspense(PlannerPage) },
  ],
  analytics: [
    {
      element: withSuspense(AnalyticsLayout),
      children: [
        { index: true, element: withSuspense(StudyAnalyticsPage) },
        { path: 'tarefas', element: withSuspense(TaskAnalyticsPage) },
        { path: 'metas', element: withSuspense(GoalsHabitsAnalyticsPage) },
        { path: 'atividades', element: withSuspense(ActivityAnalyticsPage) },
        { path: 'semana', element: withSuspense(WeeklyReviewPage) },
      ],
    },
  ],
  recommendations: [{ index: true, element: withSuspense(RecommendationsPage) }],
  projects: [
    { index: true, element: withSuspense(ProjectsPage) },
    { path: ':projectId', element: withSuspense(ProjectDetailPage) },
  ],
};
