/**
 * Gráficos (Recharts) com as mesmas regras em todas as análises:
 *  - cores em ordem fixa por ENTIDADE (tokens --lo-chart-*), nunca por posição no ranking;
 *  - uma única escala no eixo Y; marcas finas; grade discreta;
 *  - tooltip ao passar o mouse/tocar; legenda quando há 2+ séries;
 *  - tabela equivalente sempre disponível ("Ver dados em tabela") — o gráfico nunca é a
 *    única forma de ler o número, nem a cor a única forma de distinguir séries.
 */
import { useId, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { SERIES_PRIMARY } from './chart-colors';
import { Sparkline } from './visuals';

/** Id seguro para url(#…) a partir do useId do React. */
function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

const axisProps = {
  stroke: 'var(--lo-chart-axis)',
  tick: { fill: 'var(--lo-chart-axis)', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: 'var(--lo-chart-grid)' },
} as const;

const tooltipStyle = {
  contentStyle: {
    background: 'var(--lo-surface-raised)',
    border: '1px solid var(--lo-border)',
    borderRadius: 8,
    color: 'var(--lo-fg)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--lo-fg)', fontWeight: 600 },
  itemStyle: { color: 'var(--lo-fg)' },
  cursor: { fill: 'var(--lo-surface-muted)', stroke: 'var(--lo-border-strong)' },
} as const;

/** Valor ausente (null) é "sem dado", nunca 0 — também no tooltip. */
function tooltipValue(value: unknown, format: (v: number) => string): string {
  return value === null || value === undefined || value === '' ? 'sem dado' : format(Number(value));
}

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface ChartRow {
  label: string;
  [key: string]: string | number | null;
}

export function ChartCard({
  title,
  description,
  children,
  table,
  id,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  table: ReactNode;
  id: string;
  /** Controles do gráfico (ex.: destacar uma série), fora da área decorativa. */
  actions?: ReactNode;
}) {
  return (
    <Card aria-labelledby={id}>
      <CardHeader title={title} titleId={id} />
      <CardBody>
        {description && <p className="mb-3 text-body-sm text-fg-muted">{description}</p>}
        {actions && <div className="mb-3">{actions}</div>}
        <div aria-hidden="true">{children}</div>
        <details className="mt-3">
          <summary className="cursor-pointer text-body-sm font-medium text-primary">
            Ver dados em tabela
          </summary>
          <div className="mt-2 max-h-80 overflow-auto">{table}</div>
        </details>
      </CardBody>
    </Card>
  );
}

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-left text-body-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          {columns.map((c) => (
            <th key={c} scope="col" className="py-1.5 pr-3 font-medium text-fg-muted">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border last:border-0">
            {r.map((cell, j) => (
              <td key={j} className="py-1.5 pr-3 tabular-nums">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarSeriesChart({
  data,
  series,
  format,
  stacked = false,
  height = 240,
  layout = 'horizontal',
  rowColors,
  integer = false,
  axisFormat,
  reference,
  highlight,
}: {
  data: ChartRow[];
  /** Chave da série em destaque; as outras ficam esmaecidas. */
  highlight?: string | null;
  /** Linha de referência horizontal (ex.: média do período). */
  reference?: { value: number; label: string } | null;
  /** Contagens: eixo só com inteiros. */
  integer?: boolean;
  /** Formato curto para os rótulos do eixo (o tooltip usa `format`). */
  axisFormat?: (v: number) => string;
  /** Cor por barra (série única), seguindo a ENTIDADE de cada linha. */
  rowColors?: string[];
  series: Series[];
  format: (v: number) => string;
  stacked?: boolean;
  height?: number;
  /** "vertical" = barras deitadas (categorias no eixo Y), melhor para nomes longos. */
  layout?: 'horizontal' | 'vertical';
}) {
  const vertical = layout === 'vertical';
  const gradientId = useSvgId('bar');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        // O gráfico é decorativo para leitores de tela (a tabela equivalente é a alternativa
        // acessível); sem a camada de acessibilidade do Recharts ele não recebe foco do teclado
        // dentro de um contêiner aria-hidden.
        accessibilityLayer={false}
        // Cor por barra: o Recharts usa o campo "fill" de cada linha.
        data={
          rowColors && series.length === 1
            ? data.map((row, i) => ({ ...row, fill: rowColors[i] ?? null }))
            : data
        }
        layout={vertical ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        barCategoryGap="20%"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1={vertical ? 0 : 1} x2={vertical ? 1 : 0} y2="0">
            <stop offset="0" stopColor={SERIES_PRIMARY} stopOpacity={0.45} />
            <stop offset="1" stopColor={SERIES_PRIMARY} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="var(--lo-chart-grid)"
          strokeDasharray="3 4"
          vertical={vertical}
          horizontal={!vertical}
        />
        {vertical ? (
          <>
            <XAxis
              type="number"
              {...axisProps}
              allowDecimals={!integer}
              tickFormatter={(v: number) => (axisFormat ?? format)(v)}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={124}
              {...axisProps}
              tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...axisProps} minTickGap={8} />
            <YAxis
              {...axisProps}
              width={56}
              allowDecimals={!integer}
              tickFormatter={(v: number) => (axisFormat ?? format)(v)}
            />
          </>
        )}
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [tooltipValue(value, format), String(name)]}
        />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            // Texto da legenda sempre legível (a cor da série fica no marcador).
            formatter={(value: string) => (
              <span style={{ color: 'var(--lo-fg-muted)' }}>{value}</span>
            )}
          />
        )}
        {reference && !vertical && (
          <ReferenceLine
            y={reference.value}
            stroke="var(--lo-orange)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            ifOverflow="extendDomain"
            label={{
              value: reference.label,
              position: 'insideTopRight',
              fill: 'var(--lo-fg-muted)',
              fontSize: 11,
            }}
          />
        )}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color === SERIES_PRIMARY && !rowColors ? `url(#${gradientId})` : s.color}
            radius={stacked ? 2 : vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            stroke="var(--lo-surface)"
            strokeWidth={stacked ? 1 : 0}
            maxBarSize={36}
            fillOpacity={highlight && highlight !== s.key ? 0.2 : 1}
            {...(stacked ? { stackId: 'a' } : {})}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeriesChart({
  data,
  series,
  format,
  height = 240,
}: {
  data: ChartRow[];
  series: Series[];
  format: (v: number) => string;
  height?: number;
}) {
  const areaId = useSvgId('area');
  const first = series[0];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        accessibilityLayer={false}
        data={data}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={first?.color} stopOpacity={0.28} />
            <stop offset="1" stopColor={first?.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--lo-chart-grid)" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={12} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => format(v)} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [tooltipValue(value, format), String(name)]}
        />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            // Texto da legenda sempre legível (a cor da série fica no marcador).
            formatter={(value: string) => (
              <span style={{ color: 'var(--lo-fg-muted)' }}>{value}</span>
            )}
          />
        )}
        {first && (
          // Preenchimento suave sob a primeira série (só visual: fora da legenda e do tooltip).
          <Area
            type="monotone"
            dataKey={first.key}
            fill={`url(#${areaId})`}
            stroke="none"
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
            connectNulls={false}
          />
        )}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            {...(i === 1 ? { strokeDasharray: '6 4' } : {})}
            dot={{ r: 3, strokeWidth: 0, fill: s.color }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Direção de uma variação, para a seta ao lado da comparação. */
export type TrendDirection = 'up' | 'down' | 'same' | null;

/**
 * Cartão-resumo: valor com unidade, rótulo, (opcional) comparação descrita em texto com a
 * seta da direção e (opcional) minilinha de tendência ao longo do período.
 */
export function StatTile({
  label,
  value,
  detail,
  comparison,
  direction = null,
  trend,
}: {
  label: string;
  value: string;
  detail?: string;
  comparison?: string | null;
  direction?: TrendDirection;
  /** Valores na ordem do tempo (dias/semanas do período). */
  trend?: readonly number[];
}) {
  return (
    <div className="relative flex flex-col rounded-lg border border-border surface-card p-4 shadow-elev-1 sm:p-5">
      {trend && (
        <Sparkline values={trend} className="absolute top-3.5 right-4 h-7 w-20 sm:top-4.5" />
      )}
      <p
        className={cn(
          'text-overline font-semibold tracking-[0.06em] text-fg-subtle uppercase',
          trend && 'pr-24',
        )}
      >
        {label}
      </p>
      <p className="mt-2 text-metric font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      {detail && <p className="mt-1.5 text-caption text-fg-muted">{detail}</p>}
      {comparison && (
        <p className="mt-auto pt-2 text-caption text-fg-muted">
          <span className="sr-only">Comparação com o período anterior: </span>
          {direction === 'up' || direction === 'down' ? (
            <span
              aria-hidden="true"
              className={cn(
                'mr-1 font-semibold',
                direction === 'up' ? 'text-[var(--lo-text-green)]' : 'text-[var(--lo-text-orange)]',
              )}
            >
              {direction === 'up' ? '▲' : '▼'}
            </span>
          ) : null}
          {comparison}
        </p>
      )}
    </div>
  );
}
