import { Timer } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubNav } from '@/components/ui/SubNav';
import { useNow } from '@/hooks/useNow';
import { formatClock, isPaused, netSeconds } from './logic/timer';
import { useActiveSessionQuery } from './data/studies-api';

/** Estrutura comum do módulo de estudos: título, seções e aviso de sessão em andamento. */
export function StudiesLayout() {
  const location = useLocation();
  const onTimer = location.pathname.startsWith('/estudos/cronometro');
  return (
    <div className="animate-fade-up">
      <PageHeader
        module="studies"
        eyebrow={<span className="inline-flex items-center gap-2">Executar</span>}
        title="Estudos"
        description="Matérias e tópicos, sessões de foco com cronômetro confiável e revisões espaçadas."
      />
      <SubNav
        label="Seções de estudos"
        items={[
          { to: '/estudos', label: 'Matérias', end: true },
          { to: '/estudos/cronometro', label: 'Cronômetro' },
          { to: '/estudos/revisoes', label: 'Revisões' },
        ]}
      />
      {!onTimer && <ActiveSessionBanner />}
      <Outlet />
    </div>
  );
}

function ActiveSessionBanner() {
  const active = useActiveSessionQuery();
  const now = useNow(1000);
  if (!active.data) return null;
  const { session, pauses } = active.data;
  const seconds = netSeconds(session.started_at, pauses, null, now.getTime());
  return (
    <Link
      to="/estudos/cronometro"
      className="mb-6 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-soft p-3 text-body-sm text-primary-soft-fg"
    >
      <Timer aria-hidden="true" className="size-5 shrink-0" />
      <span className="flex-1">
        {isPaused(pauses) ? 'Sessão pausada' : 'Sessão em andamento'} ·{' '}
        <span className="font-semibold tabular">{formatClock(seconds)}</span>
      </span>
      <span className="font-medium underline">Abrir cronômetro</span>
    </Link>
  );
}
