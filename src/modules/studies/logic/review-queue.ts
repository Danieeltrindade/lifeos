import { daysBetween, type ISODate } from '@/lib/date';
import type { Tables } from '@/services/supabase/database.types';

type ReviewCard = Tables<'review_cards'>;

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export type ReviewGroup = { id: string; title: string; cards: ReviewCard[] };

export function groupReviews(cards: readonly ReviewCard[], today: ISODate): ReviewGroup[] {
  const active = cards
    .filter((c) => c.status === 'active')
    .sort((a, b) =>
      a.due_on < b.due_on
        ? -1
        : a.due_on > b.due_on
          ? 1
          : (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1),
    );
  return [
    { id: 'overdue', title: 'Atrasadas', cards: active.filter((c) => c.due_on < today) },
    { id: 'today', title: 'Hoje', cards: active.filter((c) => c.due_on === today) },
    {
      id: 'week',
      title: 'Próximos 7 dias',
      cards: active.filter((c) => c.due_on > today && daysBetween(c.due_on, today) <= 7),
    },
    {
      id: 'later',
      title: 'Mais tarde',
      cards: active.filter((c) => daysBetween(c.due_on, today) > 7),
    },
    { id: 'suspended', title: 'Suspensas', cards: cards.filter((c) => c.status === 'suspended') },
  ].filter((g) => g.cards.length > 0);
}
