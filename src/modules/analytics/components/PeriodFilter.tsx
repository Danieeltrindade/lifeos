import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePeriod } from './use-period';
import { Button } from '@/components/ui/Button';
import { FilterSelect } from '@/components/ui/SearchField';
import { addDays } from '@/lib/date';
import {
  nextPeriod,
  PERIOD_KIND_LABELS,
  periodLabel,
  previousPeriod,
  resolvePeriod,
  type PeriodKind,
} from '../logic/periods';

export function PeriodFilter() {
  const { period, progress, comparison, setPeriod, today, weekStartsOn } = usePeriod();
  const last = addDays(period.to, -1);
  return (
    <section aria-label="Filtro de período" className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          label="Período"
          value={period.kind}
          onChange={(v) => {
            const kind = v as PeriodKind;
            setPeriod(
              kind === 'custom'
                ? resolvePeriod('custom', today, weekStartsOn, {
                    from: period.from,
                    toInclusive: last,
                  })
                : resolvePeriod(kind, today, weekStartsOn),
            );
          }}
          options={(Object.keys(PERIOD_KIND_LABELS) as PeriodKind[]).map((k) => ({
            value: k,
            label: PERIOD_KIND_LABELS[k],
          }))}
        />
        {period.kind === 'custom' ? (
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-caption font-medium text-fg-muted">
              De
              <input
                type="date"
                className="h-10 rounded-md border border-border-strong bg-surface px-2 text-body-sm text-fg"
                value={period.from}
                max={last}
                onChange={(e) => {
                  if (e.target.value)
                    setPeriod(
                      resolvePeriod('custom', today, weekStartsOn, {
                        from: e.target.value,
                        toInclusive: last,
                      }),
                    );
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-caption font-medium text-fg-muted">
              Até
              <input
                type="date"
                className="h-10 rounded-md border border-border-strong bg-surface px-2 text-body-sm text-fg"
                value={last}
                min={period.from}
                onChange={(e) => {
                  if (e.target.value)
                    setPeriod(
                      resolvePeriod('custom', today, weekStartsOn, {
                        from: period.from,
                        toInclusive: e.target.value,
                      }),
                    );
                }}
              />
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Período anterior"
              icon={<ChevronLeft className="size-4" />}
              onClick={() => {
                setPeriod(previousPeriod(period));
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPeriod(resolvePeriod(period.kind, today, weekStartsOn));
              }}
            >
              Atual
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Próximo período"
              icon={<ChevronRight className="size-4" />}
              onClick={() => {
                setPeriod(nextPeriod(period, weekStartsOn));
              }}
            />
          </div>
        )}
      </div>
      <p className="text-body-sm text-fg-muted" aria-live="polite">
        <span className="font-semibold text-fg">{periodLabel(period)}</span>
        {progress.state === 'current' &&
          ` · em andamento (${String(progress.elapsedDays)} de ${String(progress.totalDays)} dias): os totais ainda podem crescer`}
        {progress.state === 'future' && ' · período futuro: ainda não há registros'}
        {comparison &&
          (comparison.aligned
            ? ` · comparado com os primeiros ${String(comparison.elapsedDays)} dias do período anterior`
            : ' · comparado com o período anterior completo')}
      </p>
    </section>
  );
}
