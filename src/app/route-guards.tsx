import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { SessionLoading } from '@/components/layout/FullPageStatus';
import { safeRedirectPath, signInPathFor } from '@/lib/redirect';
import { useAuth } from '@/services/auth/auth-context';

/**
 * Rotas privadas. Isto é EXPERIÊNCIA, não segurança: mesmo que alguém burle a interface,
 * o banco só entrega dados ao dono do JWT (RLS). Sem sessão, leva ao login guardando o
 * destino para voltar depois.
 */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <SessionLoading />;
  if (state.status === 'signed_out') {
    return <Navigate to={signInPathFor(location.pathname, location.search)} replace />;
  }
  return <Outlet />;
}

/** Telas de login/cadastro/recuperação: quem já está logado segue para o destino. */
export function PublicOnly() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  if (state.status === 'loading') return <SessionLoading />;
  if (state.status === 'signed_in') {
    if (state.recovery) return <Navigate to="/redefinir-senha" replace />;
    return <Navigate to={safeRedirectPath(params.get('redirectTo'))} replace />;
  }
  return <Outlet />;
}
