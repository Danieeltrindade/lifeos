import { ArrowRight, CircleDashed, Construction } from 'lucide-react';
import { Link } from 'react-router';
import { getModule, STATUS_LABELS, type ModuleId } from '@/app/modules';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

/**
 * Página introdutória de um módulo ainda não implementado.
 * Diz com clareza o que o módulo fará e quando — não simula funcionalidades.
 */
export function ModuleIntroPage({ moduleId }: { moduleId: ModuleId }) {
  const mod = getModule(moduleId);
  const Icon = mod.icon;
  const capabilitiesId = `${mod.id}-capabilities`;
  const connectionsId = `${mod.id}-connections`;

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4" />
            Módulo
          </span>
        }
        title={mod.label}
        description={mod.summary}
        actions={<Badge tone="accent">{STATUS_LABELS[mod.status]}</Badge>}
      />

      <div
        role="note"
        className="mb-6 flex gap-3 rounded-lg border border-border bg-surface-muted p-4 text-body-sm text-fg-muted"
      >
        <Construction aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          Este módulo ainda não está disponível. Ele está previsto para a{' '}
          <strong className="font-semibold text-fg">fase {mod.phase}</strong> do roadmap. Nada nesta
          página registra ou altera dados.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card aria-labelledby={capabilitiesId} className="md:col-span-3">
          <CardHeader title="O que estará disponível" titleId={capabilitiesId} />
          <CardBody>
            <ul className="flex flex-col gap-3">
              {mod.plannedCapabilities.map((cap) => (
                <li key={cap} className="flex gap-3 text-body-sm">
                  <CircleDashed
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-fg-subtle"
                  />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card aria-labelledby={connectionsId} className="md:col-span-2">
          <CardHeader title="Integra-se com" titleId={connectionsId} />
          <CardBody>
            <ul className="flex flex-col gap-1">
              {mod.connectsTo.map((id) => {
                const other = getModule(id);
                const OtherIcon = other.icon;
                return (
                  <li key={id}>
                    <Link
                      to={other.path}
                      className="group flex min-h-11 items-center gap-3 rounded-md px-2 -mx-2 text-body-sm hover:bg-surface-muted"
                    >
                      <OtherIcon aria-hidden="true" className="size-4 text-fg-subtle" />
                      <span className="flex-1">{other.label}</span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
