import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import { ModuleIntroPage } from '@/modules/shared/ModuleIntroPage';
import { NotFoundPage } from '@/modules/shared/NotFoundPage';
import { MODULES, type ModuleId } from './modules';

/**
 * Páginas com implementação própria. Os demais módulos usam a página introdutória.
 * Na medida em que os módulos forem implementados, entram neste mapa (com lazy loading).
 */
const IMPLEMENTED_PAGES: Partial<Record<ModuleId, ComponentType>> = {
  dashboard: DashboardPage,
  settings: SettingsPage,
};

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      ...MODULES.map((mod): RouteObject => {
        const Page = IMPLEMENTED_PAGES[mod.id];
        const element = Page ? <Page /> : <ModuleIntroPage moduleId={mod.id} />;
        return mod.path === '/' ? { index: true, element } : { path: mod.path, element };
      }),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
