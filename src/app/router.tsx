import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ForgotPasswordPage } from '@/modules/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/modules/auth/ResetPasswordPage';
import { SignInPage } from '@/modules/auth/SignInPage';
import { SignUpPage } from '@/modules/auth/SignUpPage';
import { ModuleIntroPage } from '@/modules/shared/ModuleIntroPage';
import { NotFoundPage } from '@/modules/shared/NotFoundPage';
import { MODULE_ROUTES } from './module-routes';
import { MODULES } from './modules';
import { PublicOnly, RequireAuth } from './route-guards';
import { RouteError } from './RouteError';

const appRoutes: RouteObject[] = [
  {
    element: <PublicOnly />,
    children: [
      { path: '/entrar', element: <SignInPage /> },
      { path: '/cadastro', element: <SignUpPage /> },
      { path: '/recuperar-senha', element: <ForgotPasswordPage /> },
    ],
  },
  // Acessível com sessão de recuperação (vinda do link do e-mail).
  { path: '/redefinir-senha', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            // Erro numa tela aparece DENTRO do app (a navegação continua disponível).
            errorElement: <RouteError />,
            children: [
              // Módulos ainda não implementados mostram a página introdutória (sem simular nada).
              ...MODULES.map((mod): RouteObject => ({
                path: mod.path,
                children: MODULE_ROUTES[mod.id] ?? [
                  { index: true, element: <ModuleIntroPage moduleId={mod.id} /> },
                ],
              })),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

/** Raiz: qualquer erro não tratado mostra a página de erro do LifeOS, nunca a padrão. */
export const routes: RouteObject[] = [{ errorElement: <RouteError />, children: appRoutes }];
