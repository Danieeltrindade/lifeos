import { ArrowRight, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import { DEV_TOOLS_ENABLED } from '@/services/data-source/data-source';
import type { SetupCounts } from '@/types/domain';

const STEPS: { key: keyof SetupCounts; label: string; to: string; hint: string }[] = [
  {
    key: 'subjects',
    label: 'Cadastre uma matéria',
    to: '/estudos',
    hint: 'Tópicos, sessões de foco e revisões.',
  },
  {
    key: 'tasks',
    label: 'Crie uma tarefa',
    to: '/tarefas',
    hint: 'Com prazo, prioridade e subtarefas.',
  },
  {
    key: 'events',
    label: 'Planeje um bloco no calendário',
    to: '/calendario',
    hint: 'Compromissos e blocos de estudo.',
  },
  {
    key: 'habits',
    label: 'Comece um hábito',
    to: '/habitos',
    hint: 'Todo dia, dias certos ou N vezes por semana.',
  },
  {
    key: 'goals',
    label: 'Defina uma meta',
    to: '/metas',
    hint: 'Horas, sessões, páginas, tarefas…',
  },
];

/**
 * Primeiros passos: aparece enquanto faltam dados básicos, no lugar de vários cards vazios.
 * Some sozinho à medida que a conta ganha registros reais.
 */
export function Onboarding({ setup, compact }: { setup: SetupCounts; compact: boolean }) {
  const missing = STEPS.filter((s) => setup[s.key] === 0);
  if (missing.length === 0) return null;
  return (
    <section
      aria-labelledby="dash-onboarding"
      className="mb-4 rounded-lg border border-primary/25 bg-primary-soft p-5"
    >
      <div className="flex items-start gap-3">
        <Sprout aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 id="dash-onboarding" className="font-semibold text-fg">
            {compact ? 'Próximos passos' : 'Seu LifeOS ainda está vazio — e isso é o estado real.'}
          </h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            O painel mostra só o que existe nos seus registros. Comece por aqui:
            {DEV_TOOLS_ENABLED && !compact && (
              <>
                {' '}
                (em desenvolvimento, dá para avaliar o layout com os{' '}
                <Link
                  to="/configuracoes"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  dados de demonstração
                </Link>
                )
              </>
            )}
          </p>
          <ul
            className={`mt-3 grid gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}
          >
            {missing.map((s) => (
              <li key={s.key}>
                <Link
                  to={s.to}
                  className="group flex h-full items-center gap-3 rounded-md border border-border bg-surface p-3 hover:border-border-strong"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-medium">{s.label}</span>
                    <span className="block text-caption text-fg-subtle">{s.hint}</span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-fg-subtle group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
