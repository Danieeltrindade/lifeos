import { Check, Clock, ExternalLink, Sparkles, ThumbsDown, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { Dialog } from '@/components/ui/Dialog';
import { TextareaField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { QueryState } from '@/components/ui/QueryState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState } from '@/components/ui/States';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays, formatDateOnly, localDateIn } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import {
  OPEN_STATUSES,
  useDecideRecommendation,
  useRecommendationsQuery,
  type RecommendationRow,
  type RecStatus,
} from './data/recommendations-api';
import { useRecommendationEngine } from './data/use-recommendation-engine';
import { PARAMS, RULES, ruleById } from './logic/rules';

type Tab = 'active' | 'snoozed' | 'history';

const PRIORITY: Record<number, { label: string; tone: BadgeTone }> = {
  1: { label: 'Prioridade alta', tone: 'danger' },
  2: { label: 'Prioridade média', tone: 'warning' },
  3: { label: 'Prioridade baixa', tone: 'neutral' },
};

const CLOSE_REASON: Record<string, string> = {
  dismissed: 'Rejeitada por você',
  user_resolved: 'Resolvida por você',
  condition_cleared: 'Encerrada: a situação deixou de existir',
  expired: 'Expirou',
};

function evidenceEntries(evidence: unknown): [string, string][] {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [];
  return Object.entries(evidence as Record<string, unknown>).map(([k, v]) => [
    k.replace(/([A-Z])/g, ' $1').toLowerCase(),
    Array.isArray(v)
      ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ')
      : v === null || v === undefined
        ? '—'
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v as string | number | boolean),
  ]);
}

function actionOf(row: RecommendationRow): { to: string; label: string } | null {
  const a = row.action as { kind?: string; to?: string; label?: string } | null;
  if (!a || a.kind !== 'navigate' || typeof a.to !== 'string' || !a.to.startsWith('/')) return null;
  return { to: a.to, label: a.label ?? 'Abrir' };
}

export function RecommendationsPage() {
  const engine = useRecommendationEngine({ sync: true });
  const query = useRecommendationsQuery();
  const [tab, setTab] = useState<Tab>('active');
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4" />
            Avaliar
          </span>
        }
        title="Recomendações"
        description="Sugestões geradas por regras explícitas sobre seus registros — cada uma mostra o motivo e os dados em que se baseia. Aceitar nunca muda nada sozinho."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Tab>
          label="Mostrar"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: 'Ativas' },
            { value: 'snoozed', label: 'Adiadas' },
            { value: 'history', label: 'Histórico' },
          ]}
        />
        <Button
          variant="ghost"
          onClick={() => {
            setShowRules(true);
          }}
        >
          Como funcionam as regras
        </Button>
      </div>
      {!engine.ready ? (
        <p className="mb-3 text-caption text-fg-subtle" role="status">
          Avaliando as regras com seus dados…
        </p>
      ) : engine.evaluation.insufficient.length > 0 ? (
        <p className="mb-3 text-caption text-fg-subtle">
          Ainda sem dados suficientes para:{' '}
          {engine.evaluation.insufficient.map((id) => ruleById(id)?.title ?? id).join('; ')}.
        </p>
      ) : null}
      {engine.syncError && (
        <Notice tone="warning" className="mb-3">
          Não foi possível atualizar as recomendações agora. As já salvas continuam abaixo.
        </Notice>
      )}
      <QueryState query={query} title="Não foi possível carregar as recomendações">
        {(rows) => <RecommendationList rows={rows} tab={tab} />}
      </QueryState>
      <Dialog
        open={showRules}
        onClose={() => {
          setShowRules(false);
        }}
        title="Regras de recomendação"
        size="lg"
      >
        <RulesCatalog />
      </Dialog>
    </div>
  );
}

function RecommendationList({ rows, tab }: { rows: RecommendationRow[]; tab: Tab }) {
  const visible = rows
    .filter((r) => {
      const status = r.status as RecStatus;
      if (tab === 'active') return status === 'pending' || status === 'accepted';
      if (tab === 'snoozed') return status === 'snoozed';
      return !OPEN_STATUSES.includes(status);
    })
    .sort((a, b) =>
      tab === 'history'
        ? (b.closed_at ?? '').localeCompare(a.closed_at ?? '')
        : a.priority - b.priority || b.generated_at.localeCompare(a.generated_at),
    );
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-6" />}
        title={
          tab === 'active'
            ? 'Nenhuma recomendação ativa'
            : tab === 'snoozed'
              ? 'Nada adiado'
              : 'Histórico vazio'
        }
        {...(tab === 'active'
          ? {
              description:
                'As regras não encontraram nada que precise de atenção agora. Sem dados suficientes, nenhuma sugestão é inventada.',
            }
          : {})}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {visible.map((r) => (
        <li key={r.id}>
          <RecommendationCard row={r} />
        </li>
      ))}
    </ul>
  );
}

function RecommendationCard({ row }: { row: RecommendationRow }) {
  const { timezone, today } = useUserCalendar();
  const decide = useDecideRecommendation();
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState('');
  const status = row.status as RecStatus;
  const rule = ruleById(row.rule_id);
  const action = actionOf(row);
  const prio = PRIORITY[row.priority] ?? PRIORITY[2];
  const open = OPEN_STATUSES.includes(status);
  const snoozeTo = (days: number) =>
    zonedToUtc(addDays(today, days), '08:00', timezone).toISOString();
  const day = (iso: string | null) =>
    iso ? formatDateOnly(localDateIn(new Date(iso), timezone)) : '';

  return (
    <article
      className="rounded-lg border border-border bg-surface p-4 shadow-elev-1"
      aria-labelledby={`rec-${row.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {prio && <Badge tone={prio.tone}>{prio.label}</Badge>}
        {status === 'accepted' && <Badge tone="success">Aceita em {day(row.decided_at)}</Badge>}
        {status === 'snoozed' && <Badge tone="info">Adiada até {day(row.snoozed_until)}</Badge>}
        {!open && <Badge>{CLOSE_REASON[row.close_reason ?? ''] ?? status}</Badge>}
        <span className="text-caption text-fg-subtle">
          {rule?.title ?? row.rule_id} · gerada em {day(row.generated_at)}
          {row.closed_at ? ` · encerrada em ${day(row.closed_at)}` : ''}
        </span>
      </div>
      <h2 id={`rec-${row.id}`} className="mt-2 font-semibold">
        {row.title}
      </h2>
      <p className="mt-1 text-body-sm text-fg-muted">
        <span className="font-medium text-fg">Por quê: </span>
        {row.rationale}
      </p>
      {evidenceEntries(row.evidence).length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-caption text-fg-muted sm:grid-cols-2">
          {evidenceEntries(row.evidence).map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="font-medium">{k}:</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {row.decision_note && (
        <p className="mt-2 text-caption text-fg-subtle">Sua anotação: {row.decision_note}</p>
      )}
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {action && (
            <Link to={action.to} className={buttonClasses('secondary', 'sm')}>
              <ExternalLink aria-hidden="true" className="size-4" />
              {action.label}
            </Link>
          )}
          {status === 'pending' && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Check className="size-4" />}
              disabled={decide.isPending}
              onClick={() => {
                decide.mutate({ id: row.id, decision: { status: 'accepted' } });
              }}
            >
              Aceitar
            </Button>
          )}
          {status === 'snoozed' ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 className="size-4" />}
              disabled={decide.isPending}
              onClick={() => {
                decide.mutate({ id: row.id, decision: { status: 'pending' } });
              }}
            >
              Reativar agora
            </Button>
          ) : (
            status === 'pending' && (
              <label className="inline-flex items-center gap-1.5 text-body-sm">
                <Clock aria-hidden="true" className="size-4 text-fg-subtle" />
                <span className="sr-only">Adiar recomendação</span>
                <select
                  className="h-8 rounded-md border border-border-strong bg-surface px-2 text-body-sm"
                  value=""
                  disabled={decide.isPending}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    if (days > 0)
                      decide.mutate({
                        id: row.id,
                        decision: { status: 'snoozed', until: snoozeTo(days) },
                      });
                  }}
                >
                  <option value="">Adiar…</option>
                  <option value="1">Até amanhã</option>
                  <option value="3">Por 3 dias</option>
                  <option value="7">Por 1 semana</option>
                </select>
              </label>
            )
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Check className="size-4" />}
            disabled={decide.isPending}
            onClick={() => {
              decide.mutate({ id: row.id, decision: { status: 'resolved' } });
            }}
          >
            Marcar como resolvida
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<ThumbsDown className="size-4" />}
            disabled={decide.isPending}
            onClick={() => {
              setDismissing(true);
            }}
          >
            Rejeitar
          </Button>
        </div>
      )}
      <Dialog
        open={dismissing}
        onClose={() => {
          setDismissing(false);
        }}
        title="Rejeitar recomendação?"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDismissing(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={decide.isPending}
              onClick={() => {
                decide.mutate(
                  { id: row.id, decision: { status: 'dismissed', note } },
                  {
                    onSettled: () => {
                      setDismissing(false);
                    },
                  },
                );
              }}
            >
              Rejeitar
            </Button>
          </>
        }
      >
        <p className="mb-3 text-body-sm text-fg-muted">
          A mesma sugestão não volta durante o período de espera da regra. Se a situação persistir
          depois disso, ela pode reaparecer.
        </p>
        <TextareaField
          label="Motivo (opcional)"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </Dialog>
    </article>
  );
}

function RulesCatalog() {
  return (
    <div className="flex flex-col gap-4 text-body-sm">
      <Notice tone="info">
        Todas as recomendações vêm de regras fixas de software, descritas abaixo — sem inteligência
        artificial, modelos estatísticos ou serviços externos. As regras que usam histórico só são
        avaliadas com amostra mínima (ex.: {String(PARAMS.estimateMinSample)} tarefas para
        estimativas).
      </Notice>
      {RULES.map((r) => (
        <section
          key={r.id}
          aria-labelledby={`rule-${r.id}`}
          className="rounded-md border border-border p-3"
        >
          <h3 id={`rule-${r.id}`} className="font-semibold">
            {r.title} <code className="text-caption text-fg-subtle">{r.id}</code>
          </h3>
          <p className="mt-1 text-fg-muted">{r.description}</p>
          <dl className="mt-2 grid gap-1 text-caption text-fg-muted">
            <div>
              <dt className="inline font-medium text-fg">Dispara quando: </dt>
              <dd className="inline">{r.trigger}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-fg">Dados usados: </dt>
              <dd className="inline">{r.dataNeeded.join('; ')}</dd>
            </div>
            {r.minSample && (
              <div>
                <dt className="inline font-medium text-fg">Amostra mínima: </dt>
                <dd className="inline">{r.minSample}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium text-fg">Prioridade: </dt>
              <dd className="inline">{r.priority}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-fg">Encerramento: </dt>
              <dd className="inline">{r.closing}</dd>
            </div>
          </dl>
        </section>
      ))}
    </div>
  );
}
