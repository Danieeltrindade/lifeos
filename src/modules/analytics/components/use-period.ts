import { useSearchParams } from 'react-router';
import { useUserCalendar } from '@/hooks/useUserCalendar';
import {
  comparisonFor,
  periodFromParams,
  periodProgress,
  periodToParams,
  type Period,
} from '../logic/periods';

/**
 * Período das análises, guardado na URL (?periodo=&data= ou &de=&ate=): persiste ao trocar
 * de aba, ao recarregar e pode ser compartilhado/salvo como favorito.
 */
export function usePeriod() {
  const { today, weekStartsOn } = useUserCalendar();
  const [params, setParams] = useSearchParams();
  const period = periodFromParams(params, today, weekStartsOn);
  const progress = periodProgress(period, today);
  const comparison = comparisonFor(period, today);
  const setPeriod = (p: Period) => {
    setParams((current) => periodToParams(p, current), { replace: true });
  };
  return {
    period,
    progress,
    comparison,
    setPeriod,
    today,
    weekStartsOn,
    search: params.toString(),
  };
}
