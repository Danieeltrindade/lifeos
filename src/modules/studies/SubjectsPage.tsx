import { BookOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { QueryState } from '@/components/ui/QueryState';
import { FilterSelect } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/States';
import { useWeekWindow } from '@/hooks/useWeekWindow';
import { formatDuration } from '@/lib/date';
import { pluralize } from '@/lib/text';
import {
  useMasteryQuery,
  useReviewCardsQuery,
  useSubjectsQuery,
  useTopicsQuery,
  type Subject,
} from '@/services/data/queries';
import { SubjectForm } from './components/SubjectForm';
import { latestMasteryByTopic, masteryLabel, SUBJECT_STATUS_LABELS } from './logic/subjects';
import { useStudyTimeQuery } from './data/studies-api';

type Scope = 'active' | 'all' | 'archived';

export function SubjectsPage() {
  const navigate = useNavigate();
  const subjectsQuery = useSubjectsQuery();
  const topics = useTopicsQuery().data ?? [];
  const mastery = useMasteryQuery().data ?? [];
  const cards = useReviewCardsQuery().data ?? [];
  const week = useWeekWindow();
  const time = useStudyTimeQuery(week.from, week.to).data ?? [];
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>('active');

  const latest = latestMasteryByTopic(mastery);
  const secondsBySubject = new Map(time.map((t) => [t.subject_id, t.seconds]));
  const topicSubject = new Map(topics.map((t) => [t.id, t.subject_id]));

  const filter = (list: Subject[]) =>
    list.filter((s) =>
      scope === 'archived'
        ? s.archived_at !== null
        : scope === 'all'
          ? s.archived_at === null
          : s.archived_at === null && s.status === 'active',
    );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <FilterSelect
          className="w-56"
          label="Mostrar"
          value={scope}
          onChange={(v) => {
            setScope(v as Scope);
          }}
          options={[
            { value: 'active', label: 'Matérias ativas' },
            { value: 'all', label: 'Todas (não arquivadas)' },
            { value: 'archived', label: 'Arquivadas' },
          ]}
        />
        <Button
          icon={<Plus className="size-4" />}
          onClick={() => {
            setCreating(true);
          }}
        >
          Nova matéria
        </Button>
      </div>
      <QueryState query={subjectsQuery} title="Não foi possível carregar as matérias">
        {(subjects) => {
          if (subjects.length === 0) {
            return (
              <EmptyState
                icon={<BookOpen className="size-6" />}
                title="Nenhuma matéria ainda"
                description="Cadastre uma matéria para organizar tópicos, registrar sessões de foco e agendar revisões."
                action={
                  <Button
                    icon={<Plus className="size-4" />}
                    onClick={() => {
                      setCreating(true);
                    }}
                  >
                    Nova matéria
                  </Button>
                }
              />
            );
          }
          const list = filter(subjects);
          if (list.length === 0) return <EmptyState title="Nenhuma matéria neste filtro" />;
          return (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => {
                const ownTopics = topics.filter(
                  (t) => t.subject_id === s.id && t.archived_at === null,
                );
                const seconds = secondsBySubject.get(s.id) ?? 0;
                const due = cards.filter(
                  (c) =>
                    c.status === 'active' &&
                    c.due_on <= week.today &&
                    topicSubject.get(c.topic_id) === s.id,
                ).length;
                const levels = ownTopics
                  .map((t) => latest.get(t.id)?.level)
                  .filter((l): l is number => l !== undefined);
                const avg =
                  levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
                return (
                  <li key={s.id}>
                    <Link
                      to={`/estudos/materias/${s.id}`}
                      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-elev-1 transition-colors hover:border-border-strong"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color ?? 'var(--lo-fg-subtle)' }}
                        />
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold">{s.name}</h2>
                          {s.objective && (
                            <p className="line-clamp-2 text-body-sm text-fg-muted">{s.objective}</p>
                          )}
                        </div>
                        {s.status !== 'active' && (
                          <Badge>{SUBJECT_STATUS_LABELS[s.status] ?? s.status}</Badge>
                        )}
                      </div>
                      <div className="mt-auto flex flex-col gap-1.5">
                        <div className="flex justify-between text-caption text-fg-subtle">
                          <span>Esta semana: {formatDuration(seconds / 60)}</span>
                          {s.target_minutes_per_week !== null && (
                            <span>meta {formatDuration(s.target_minutes_per_week)}</span>
                          )}
                        </div>
                        {s.target_minutes_per_week !== null && (
                          <ProgressBar
                            value={seconds / 60}
                            max={s.target_minutes_per_week}
                            label={`Carga semanal de ${s.name}`}
                            valueText={`${formatDuration(seconds / 60)} de ${formatDuration(s.target_minutes_per_week)}`}
                            tone="accent"
                          />
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Badge>{pluralize(ownTopics.length, 'tópico', 'tópicos')}</Badge>
                          {avg !== null && (
                            <Badge tone="info">
                              Domínio médio: {masteryLabel(Math.round(avg))}
                            </Badge>
                          )}
                          {due > 0 && (
                            <Badge tone="warning">
                              {pluralize(due, 'revisão pendente', 'revisões pendentes')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryState>
      <Dialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        title="Nova matéria"
        size="lg"
      >
        <SubjectForm
          onSaved={(s) => {
            setCreating(false);
            void navigate(`/estudos/materias/${s.id}`);
          }}
          onCancel={() => {
            setCreating(false);
          }}
        />
      </Dialog>
    </>
  );
}
