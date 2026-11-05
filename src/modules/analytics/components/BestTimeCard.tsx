import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import { addDays, type ISODate } from '@/lib/date';
import { zonedToUtc } from '@/lib/zoned';
import { useActivitiesQuery } from '@/services/data/queries';
import { formatSeconds } from '../logic/metrics';
import { bestSlot, hourHeatmap } from '../logic/visuals';
import { DataTable } from './charts';
import { HeatmapGrid } from './visuals';

const WEEKS = 8;
const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * "Quando você rende mais": tempo médio por semana em cada dia da semana × hora, nas 8
 * semanas que terminam no fim do período escolhido (ou hoje, se o período ainda não acabou).
 */
export function BestTimeCard({
  periodEnd,
  kind,
  title,
  description,
}: {
  /** Fim (exclusivo) do período escolhido. */
  periodEnd: ISODate;
  /** Só atividades deste tipo (ex.: "study"); ausente = todas. */
  kind?: string;
  title: string;
  description: string;
}) {
  const { today, timezone, weekStartsOn } = useUserCalendar();
  const to = periodEnd <= today ? periodEnd : addDays(today, 1);
  const from = addDays(to, -WEEKS * 7);
  const query = useActivitiesQuery(
    zonedToUtc(from, '00:00', timezone).toISOString(),
    zonedToUtc(to, '00:00', timezone).toISOString(),
  );
  const records = (query.data ?? []).filter((a) => !kind || a.kind === kind);
  const heatmap = hourHeatmap(records, timezone, from, to, weekStartsOn);
  const best = bestSlot(heatmap);

  // Colunas: das 6h às 24h, ampliadas se houver registros de madrugada.
  const used = heatmap.rows.flatMap((r) => r.hours.map((v, h) => (v > 0 ? h : null)));
  const usedHours = used.filter((h): h is number => h !== null);
  const fromHour = Math.min(6, ...usedHours);
  const toHour = Math.max(24, ...usedHours.map((h) => h + 1));

  return (
    <Card aria-labelledby="chart-best-time" className="mt-4 lg:mt-5">
      <CardHeader title={title} titleId="chart-best-time" />
      <CardBody>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-xl text-body-sm text-fg-muted">
            {description} Últimas {WEEKS} semanas, média por semana.
          </p>
          {best && (
            <p className="rounded-md bg-primary-soft px-3 py-2 text-body-sm text-primary-soft-fg">
              <strong className="font-semibold">Seu melhor horário:</strong> {best.text}.
            </p>
          )}
        </div>
        {query.status === 'pending' ? (
          <div className="h-48 animate-pulse rounded-md bg-surface-muted" />
        ) : query.status === 'error' ? (
          <p className="text-body-sm text-fg-subtle">Não foi possível carregar os horários.</p>
        ) : heatmap.totalSeconds === 0 ? (
          <p className="text-body-sm text-fg-subtle">
            Nenhum registro com horário nessas semanas. Conforme você usar o cronômetro ou lançar
            atividades, o mapa mostra em que dias e horas você mais produz.
          </p>
        ) : (
          <>
            <HeatmapGrid
              heatmap={heatmap}
              fromHour={fromHour}
              toHour={toHour}
              format={formatSeconds}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-body-sm font-medium text-primary">
                Ver dados em tabela
              </summary>
              <div className="mt-2 max-h-80 overflow-auto">
                <DataTable
                  caption={title}
                  columns={['Dia', 'Hora', 'Média por semana']}
                  rows={heatmap.rows.flatMap((r) =>
                    r.hours.flatMap((v, h) =>
                      v > 0
                        ? [
                            [
                              WEEKDAY_NAMES[r.weekday] ?? '',
                              `${String(h)}h–${String(h + 1)}h`,
                              formatSeconds(v),
                            ],
                          ]
                        : [],
                    ),
                  )}
                />
              </div>
            </details>
          </>
        )}
      </CardBody>
    </Card>
  );
}
