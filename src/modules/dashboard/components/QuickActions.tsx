import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  NotebookPen,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { getModule, type ModuleId } from '@/app/modules';

interface QuickAction {
  label: string;
  module: ModuleId;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { label: 'Sessão de foco', module: 'studies', icon: BookOpen },
  { label: 'Registrar atividade', module: 'activities', icon: Timer },
  { label: 'Nova tarefa', module: 'tasks', icon: CheckSquare },
  { label: 'Escrever no diário', module: 'diary', icon: NotebookPen },
];

/**
 * Atalhos para os fluxos mais frequentes. Enquanto o módulo de destino não estiver pronto,
 * o atalho diz isso explicitamente e leva à página introdutória — não simula a ação.
 */
export function QuickActions() {
  return (
    <section aria-labelledby="dash-quick" className="mb-6">
      <h2 id="dash-quick" className="sr-only">
        Ações rápidas
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {ACTIONS.map((action) => {
          const mod = getModule(action.module);
          const available = mod.status === 'available';
          const Icon = action.icon;
          return (
            <li key={action.label}>
              <Link
                to={mod.path}
                className="group flex h-full min-h-16 items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-elev-1 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-elev-2 sm:p-4"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-fg"
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm leading-tight font-medium">
                    {action.label}
                  </span>
                  {!available && (
                    <span className="block text-caption text-fg-subtle">
                      Fase {mod.phase} · em breve
                    </span>
                  )}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="hidden size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 sm:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
