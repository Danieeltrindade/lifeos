import { BarChart3 } from 'lucide-react';
import { Outlet, useLocation } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubNav } from '@/components/ui/SubNav';
import { PeriodFilter } from './components/PeriodFilter';
import { usePeriod } from './components/use-period';

/** Estrutura das análises: abas por assunto e o filtro de período compartilhado (na URL). */
export function AnalyticsLayout() {
  const { search } = usePeriod();
  const { pathname } = useLocation();
  const weekly = pathname.startsWith('/analises/semana');
  const q = search ? `?${search}` : '';
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-4" />
            Avaliar
          </span>
        }
        title="Análises"
        description="Números calculados dos seus registros reais, com a fórmula de cada um explicada. Nada é estimado ou inventado."
      />
      <SubNav
        label="Seções de análises"
        items={[
          { to: `/analises${q}`, label: 'Estudos', end: true },
          { to: `/analises/tarefas${q}`, label: 'Tarefas e projetos' },
          { to: `/analises/metas${q}`, label: 'Metas e hábitos' },
          { to: `/analises/atividades${q}`, label: 'Atividades' },
          { to: '/analises/semana', label: 'Revisão semanal' },
        ]}
      />
      {!weekly && <PeriodFilter />}
      <Outlet />
    </div>
  );
}
