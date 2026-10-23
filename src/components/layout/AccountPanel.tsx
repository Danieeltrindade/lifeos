import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/services/auth/auth-context';
import { useProfile } from '@/services/profile/profile-context';

/** Identificação do usuário logado + "Sair". Exibido na sidebar e na gaveta móvel. */
export function AccountPanel() {
  const { state, signOut } = useAuth();
  const { state: profile } = useProfile();
  const [leaving, setLeaving] = useState(false);
  if (state.status !== 'signed_in') return null;

  const email = state.user.email ?? '';
  const name =
    profile.status === 'ready' && profile.profile.displayName ? profile.profile.displayName : email;
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-body-sm font-semibold text-primary-soft-fg"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium">{name}</p>
        {name !== email && <p className="truncate text-caption text-fg-subtle">{email}</p>}
      </div>
      <button
        type="button"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          void signOut();
        }}
        className="grid size-10 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
      >
        <LogOut aria-hidden="true" className="size-4" />
        <span className="sr-only">Sair da conta</span>
      </button>
    </div>
  );
}
