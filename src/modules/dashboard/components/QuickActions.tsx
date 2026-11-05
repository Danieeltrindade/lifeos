import { BookOpen, CheckSquare, NotebookText, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { getModule, type ModuleId } from '@/app/modules';

interface QuickAction {
  label: string;
  module: ModuleId;
  /** Destino dentro do módulo (padrão: página inicial do módulo). */
  to?: string;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { label: 'Sessão de foco', module: 'studies', to: '/estudos/cronometro', icon: BookOpen },
  { label: 'Registrar atividade', module: 'activities', icon: Timer },
  { label: 'Nova tarefa', module: 'tasks', icon: CheckSquare },
  { label: 'Nova nota', module: 'notes', to: '/notas/nova', icon: NotebookText },
];

/**
 * Atalhos para os fluxos mais frequentes. Enquanto o módulo de destino não estiver pronto,
 * o atalho diz isso explicitamente e leva à página introdutória — não simula a ação.
 */
export function QuickActions() {
  return (
    <section aria-labelledby="dash-quick">
      <h2 id="dash-quick" className="sr-only">
        Ações rápidas
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {ACTIONS.map((action) => {
          const mod = getModule(action.module);
          const available = mod.status === 'available';
          const Icon = action.icon;
          return (
            <li key={action.label}>
              <Link
                to={action.to ?? mod.path}
                className="group flex min-h-11 items-center gap-2 rounded-lg py-1.5 leading-tight border border-border-strong/70 bg-surface/70 px-3.5 text-body-sm font-medium text-fg backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-150 hover:border-primary/50 hover:bg-surface-muted hover:shadow-glow sm:h-10"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="min-w-0">{action.label}</span>
                {!available && (
                  <span className="text-caption text-fg-subtle">· fase {mod.phase}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
