import { localDateIn, type ISODate } from '@/lib/date';
import { useProfile } from '@/services/profile/profile-context';
import { useNow } from './useNow';

/**
 * "Hoje", fuso e início da semana do USUÁRIO (perfil), atualizados a cada minuto —
 * a virada do dia acontece sem recarregar a página.
 */
export function useUserCalendar(): {
  timezone: string;
  today: ISODate;
  weekStartsOn: number;
  now: Date;
} {
  const { timezone, state } = useProfile();
  const now = useNow(60_000);
  return {
    timezone,
    today: localDateIn(now, timezone),
    weekStartsOn: state.status === 'ready' ? state.profile.weekStartsOn : 1,
    now,
  };
}
