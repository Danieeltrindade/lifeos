import { CalendarDays } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/date';
import type { AgendaItem, AgendaItemKind } from '@/types/domain';
import { SectionLink } from './SectionLink';

const KIND: Record<AgendaItemKind, { label: string; tone: BadgeTone; bar: string }> = {
  study: { label: 'Estudo', tone: 'primary', bar: 'bg-primary' },
  task: { label: 'Tarefa', tone: 'info', bar: 'bg-info' },
  event: { label: 'Compromisso', tone: 'neutral', bar: 'bg-fg-subtle' },
  habit: { label: 'Hábito', tone: 'accent', bar: 'bg-accent' },
};

export function AgendaSection({ items, now }: { items: AgendaItem[]; now: Date }) {
  const sorted = [...items].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const t = now.getTime();

  return (
    <Card aria-labelledby="dash-agenda" className="md:col-span-2 lg:col-span-7">
      <CardHeader
        title="Agenda de hoje"
        titleId="dash-agenda"
        icon={<CalendarDays className="size-4" />}
        description="Planejado — o que realmente aconteceu fica em Atividades"
        action={<SectionLink to="/calendario" label="Abrir calendário" />}
      />
      <CardBody>
        {sorted.length === 0 ? (
          <EmptyState
            compact
            title="Nada planejado para hoje"
            description="Blocos de tempo criados no Calendário aparecerão aqui."
          />
        ) : (
          <ol className="flex flex-col">
            {sorted.map((item) => {
              const start = new Date(item.plannedStart).getTime();
              const end = new Date(item.plannedEnd).getTime();
              const isNow = t >= start && t < end;
              const isPast = t >= end;
              const kind = KIND[item.kind];
              return (
                <li
                  key={item.id}
                  className={cn(
                    'flex items-stretch gap-3 rounded-md py-2.5',
                    isNow && '-mx-2 bg-primary-soft px-2',
                  )}
                >
                  <div className="w-12 shrink-0 pt-0.5 text-right tabular text-body-sm">
                    <time
                      dateTime={item.plannedStart}
                      className={cn(isPast ? 'text-fg-subtle' : 'text-fg')}
                    >
                      {formatTime(item.plannedStart)}
                    </time>
                    <time dateTime={item.plannedEnd} className="block text-caption text-fg-subtle">
                      {formatTime(item.plannedEnd)}
                    </time>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn('w-0.5 shrink-0 rounded-full', kind.bar, isPast && 'opacity-40')}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p
                      className={cn(
                        'min-w-0 text-body-sm font-medium',
                        isPast && 'text-fg-subtle line-through decoration-border-strong',
                      )}
                    >
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {isNow && <Badge tone="success">Agora</Badge>}
                      <Badge tone={kind.tone}>{kind.label}</Badge>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
