import { addDays } from '@/lib/date';
import { startOfWeek, zonedToUtc } from '@/lib/zoned';
import { useUserCalendar } from './useUserCalendar';

/** Semana atual do usuário (início conforme o perfil) como datas locais e instantes. */
export function useWeekWindow() {
  const { today, timezone, weekStartsOn } = useUserCalendar();
  const weekStart = startOfWeek(today, weekStartsOn);
  return {
    today,
    weekStart,
    from: zonedToUtc(weekStart, '00:00', timezone).toISOString(),
    to: zonedToUtc(addDays(weekStart, 7), '00:00', timezone).toISOString(),
  };
}
