/**
 * Gráficos (Recharts) com as mesmas regras em todas as análises:
 *  - cores em ordem fixa por ENTIDADE (tokens --lo-chart-*), nunca por posição no ranking;
 *  - uma única escala no eixo Y; marcas finas; grade discreta;
 *  - tooltip ao passar o mouse/tocar; legenda quando há 2+ séries;
 *  - tabela equivalente sempre disponível ("Ver dados em tabela") — o gráfico nunca é a
 *    única forma de ler o número, nem a cor a única forma de distinguir séries.
 */
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

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
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  table: ReactNode;
  id: string;
}) {
  return (
    <Card aria-labelledby={id}>
      <CardHeader title={title} titleId={id} />
      <CardBody>
        {description && <p className="mb-3 text-body-sm text-fg-muted">{description}</p>}
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
}: {
  data: ChartRow[];
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
        <CartesianGrid stroke="var(--lo-chart-grid)" vertical={vertical} horizontal={!vertical} />
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
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--lo-fg-muted)' }} />
        )}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            stroke="var(--lo-surface)"
            strokeWidth={stacked ? 1 : 0}
            maxBarSize={36}
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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        accessibilityLayer={false}
        data={data}
        margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke="var(--lo-chart-grid)" vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={12} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => format(v)} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [tooltipValue(value, format), String(name)]}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--lo-fg-muted)' }} />
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
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Cartão-resumo: valor com unidade, rótulo e (opcional) comparação descrita em texto. */
export function StatTile({
  label,
  value,
  detail,
  comparison,
}: {
  label: string;
  value: string;
  detail?: string;
  comparison?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-elev-1">
      <p className="text-caption font-medium text-fg-subtle">{label}</p>
      <p className="mt-1 text-title font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-caption text-fg-muted">{detail}</p>}
      {comparison && (
        <p className="mt-1 text-caption text-fg-muted">
          <span className="sr-only">Comparação com o período anterior: </span>
          {comparison}
        </p>
      )}
    </div>
  );
}
