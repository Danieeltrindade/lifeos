/**
 * Peças visuais das Análises que não são gráficos do Recharts: minilinha de tendência,
 * anel de progresso, mapa de calor, barra de ritmo e calendário do ano. Todas são
 * decorativas para leitores de tela (aria-hidden) e vêm acompanhadas do número em texto.
 */
import { cn } from '@/lib/cn';
import type { Heatmap, YearCalendar } from '../logic/visuals';
import { heatLevel } from '../logic/visuals';

/** Minilinha de tendência (sem eixos). Precisa de 2+ pontos. */
export function Sparkline({
  values,
  className,
}: {
  values: readonly number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 27 - ((v - min) / span) * 24]);
  const line = pts
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(x ?? 0).toFixed(1)} ${(y ?? 0).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn('h-8 w-24 shrink-0 overflow-visible', className)}
    >
      <path d={`${line} L100 30 L0 30 Z`} fill="var(--lo-chart-primary)" fillOpacity={0.14} />
      <path
        d={line}
        fill="none"
        stroke="var(--lo-chart-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Anel de progresso (0–1). `null` = sem base: anel vazio. */
export function ProgressRing({
  value,
  color = 'var(--lo-chart-primary)',
  size = 56,
}: {
  value: number | null;
  color?: string;
  size?: number;
}) {
  const r = 23;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--lo-progress-track)" strokeWidth="7" />
      {v > 0 && (
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(v * c).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 28 28)"
        />
      )}
    </svg>
  );
}

const SHORT_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const LEVEL_CLASSES = [
  'bg-surface-muted',
  'bg-[color-mix(in_srgb,var(--lo-chart-primary)_24%,transparent)]',
  'bg-[color-mix(in_srgb,var(--lo-chart-primary)_45%,transparent)]',
  'bg-[color-mix(in_srgb,var(--lo-chart-primary)_70%,transparent)]',
  'bg-[var(--lo-chart-primary)]',
];

/** Mapa de calor dia da semana × hora. `fromHour`/`toHour` recortam as colunas (toHour exclusivo). */
export function HeatmapGrid({
  heatmap,
  fromHour,
  toHour,
  format,
}: {
  heatmap: Heatmap;
  fromHour: number;
  toHour: number;
  format: (seconds: number) => string;
}) {
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  return (
    <div className="overflow-x-auto pb-1">
      <div
        aria-hidden="true"
        className="grid min-w-[560px] gap-1"
        style={{
          gridTemplateColumns: `2.5rem repeat(${String(hours.length)}, minmax(1.25rem, 1fr))`,
        }}
      >
        <span />
        {hours.map((h) => (
          <span key={h} className="text-center text-[11px] text-fg-subtle tabular-nums">
            {h % 2 === 0 ? `${String(h)}h` : ''}
          </span>
        ))}
        {heatmap.rows.map((row) => (
          <HeatRow key={row.weekday} row={row} hours={hours} max={heatmap.max} format={format} />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-3 flex items-center gap-1.5 text-caption text-fg-subtle"
      >
        Menos
        {LEVEL_CLASSES.map((c) => (
          <span key={c} className={cn('size-3.5 rounded-[4px]', c)} />
        ))}
        Mais
      </div>
    </div>
  );
}

function HeatRow({
  row,
  hours,
  max,
  format,
}: {
  row: Heatmap['rows'][number];
  hours: number[];
  max: number;
  format: (seconds: number) => string;
}) {
  const day = SHORT_WEEKDAYS[row.weekday] ?? '';
  return (
    <>
      <span className="self-center text-caption text-fg-muted">{day}</span>
      {hours.map((h) => {
        const v = row.hours[h] ?? 0;
        return (
          <span
            key={h}
            title={`${day} ${String(h)}h: ${v > 0 ? format(v) : 'nada'} por semana, em média`}
            className={cn('h-6 rounded-[5px]', LEVEL_CLASSES[heatLevel(v, max)])}
          />
        );
      })}
    </>
  );
}

/** Barra de progresso com a marca do "ritmo ideal" de hoje. */
export function PaceBar({
  value,
  target,
  expected,
  behind,
}: {
  value: number;
  target: number;
  expected: number | null;
  behind: boolean;
}) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const mark = expected !== null && target > 0 ? Math.min(1, expected / target) : null;
  return (
    <div aria-hidden="true" className="relative h-3 rounded-full bg-[var(--lo-progress-track)]">
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          behind ? 'bg-[var(--lo-orange)]' : 'bg-[var(--lo-chart-primary)]',
        )}
        style={{ width: `${(pct * 100).toFixed(1)}%` }}
      />
      {mark !== null && (
        <span
          className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full bg-fg"
          style={{ left: `${(mark * 100).toFixed(1)}%` }}
        />
      )}
    </div>
  );
}

const CELL_CLASSES: Record<string, string> = {
  done: 'bg-[var(--lo-chart-primary)]',
  missed: 'bg-surface-muted ring-1 ring-inset ring-border-strong',
  off: 'ring-1 ring-inset ring-border',
  before: '',
  future: '',
};

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Quadriculado do ano (53 semanas × 7 dias). */
export function YearCalendarGrid({
  calendar,
  weekdayLabels,
}: {
  calendar: YearCalendar;
  /** Rótulos das 7 linhas, na ordem da semana do perfil. */
  weekdayLabels: string[];
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div aria-hidden="true" className="flex min-w-[860px] gap-2">
        <div className="grid grid-rows-[1.125rem_repeat(7,0.8125rem)] gap-[3px] text-[10.5px] text-fg-subtle">
          <span />
          {weekdayLabels.map((l, i) => (
            <span key={`${l}-${String(i)}`} className="leading-[0.8125rem]">
              {i % 2 === 0 ? l : ''}
            </span>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-[3px]">
          <div className="grid h-[1.125rem] grid-cols-[repeat(53,0.8125rem)] gap-x-[3px] text-[10.5px] text-fg-subtle">
            {calendar.months.map((m) => (
              <span
                key={`${m.label}-${String(m.column)}`}
                style={{ gridColumn: `${String(m.column + 1)} / span 3` }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-cols-[repeat(53,0.8125rem)] grid-rows-[repeat(7,0.8125rem)] gap-[3px]">
            {calendar.weeks.flatMap((w) =>
              w.days.map((d) => (
                <span
                  key={d.date}
                  title={
                    d.state === 'future' || d.state === 'before'
                      ? undefined
                      : `${DATE_FMT.format(new Date(`${d.date}T00:00:00Z`))}: ${
                          d.state === 'done'
                            ? 'feito'
                            : d.state === 'missed'
                              ? 'não feito'
                              : 'não esperado'
                        }`
                  }
                  className={cn('rounded-[3px]', CELL_CLASSES[d.state])}
                />
              )),
            )}
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-3 flex flex-wrap items-center gap-4 text-caption text-fg-subtle"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('size-3 rounded-[3px]', CELL_CLASSES.done)} />
          Feito
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('size-3 rounded-[3px]', CELL_CLASSES.missed)} />
          Esperado, não feito
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('size-3 rounded-[3px]', CELL_CLASSES.off)} />
          Não esperado
        </span>
      </div>
    </div>
  );
}
