import { describe, expect, it, vi } from 'vitest';
import type { LifeosClient } from '@/services/supabase/client';
import { fetchProfile, toProfile, toProfileUpdate, updateProfile } from './profile-repository';

const ROW = {
  id: 'u1',
  display_name: 'Ana',
  timezone: 'America/Sao_Paulo',
  week_starts_on: 1,
  theme_preference: 'dark',
  email_notifications: false,
};

/** Cliente mínimo: devolve `results` em ordem e registra as colunas/escritas pedidas. */
function fakeClient(results: { data: unknown; error: unknown }[]) {
  const calls: { columns: string; update?: unknown }[] = [];
  const client = {
    from: () => {
      let update: unknown;
      const builder = {
        update: (row: unknown) => {
          update = row;
          return builder;
        },
        select: (columns: string) => {
          calls.push({ columns, update });
          return builder;
        },
        eq: () => builder,
        abortSignal: () => builder,
        single: vi.fn(() => Promise.resolve(results.shift())),
      };
      return builder;
    },
  } as unknown as LifeosClient;
  return { client, calls };
}

describe('perfil — paleta de cores', () => {
  it('lê e grava theme_color; valor desconhecido vira ocean', () => {
    expect(toProfile({ ...ROW, theme_color: 'nebula' }).themeColor).toBe('nebula');
    expect(toProfile({ ...ROW, theme_color: 'removido' }).themeColor).toBe('ocean');
    expect(toProfileUpdate({ themeColor: 'gold' })).toEqual({ theme_color: 'gold' });
  });

  it('banco sem a coluna (migration não aplicada): perfil carrega e a paleta fica local', async () => {
    const missing = { code: '42703', message: 'column profiles.theme_color does not exist' };
    const { client, calls } = fakeClient([
      { data: null, error: missing },
      { data: ROW, error: null },
    ]);
    const profile = await fetchProfile(client, 'u1');
    expect(profile.themeColor).toBeNull();
    expect(profile.themePreference).toBe('dark');
    expect(calls[0]?.columns).toContain('theme_color');
    expect(calls[1]?.columns).not.toContain('theme_color');
  });

  it('gravação sem a coluna salva o restante do perfil', async () => {
    const missing = { code: 'PGRST204', message: "Could not find the 'theme_color' column" };
    const { client, calls } = fakeClient([
      { data: null, error: missing },
      { data: { ...ROW, theme_preference: 'light' }, error: null },
    ]);
    const profile = await updateProfile(client, 'u1', {
      themeColor: 'rose',
      themePreference: 'light',
    });
    expect(profile.themePreference).toBe('light');
    expect(calls[1]?.update).toEqual({ theme_preference: 'light' });
  });
});
