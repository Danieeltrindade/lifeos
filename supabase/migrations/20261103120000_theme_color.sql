-- =============================================================================
-- Paleta de cores da interface (tema de cores), escolhida por conta.
--
-- Estende a estrutura de preferências que já existe em public.profiles (ao lado de
-- theme_preference, que guarda o modo claro/escuro/sistema). Nada de tabela nova:
--   * o RLS existente ("profiles: dono lê" / "profiles: dono altera") já garante que cada
--     usuário só lê e altera o próprio perfil;
--   * o GRANT por coluna é estendido só para a nova coluna;
--   * a lista de valores fica no banco (CHECK), como a de theme_preference.
-- Contas existentes e novas recebem 'ocean' — a aparência atual do LifeOS.
-- =============================================================================

alter table public.profiles
  add column theme_color text not null default 'ocean'
    constraint profiles_theme_color_valid check (
      theme_color in (
        'ocean', 'nebula', 'forest', 'ember', 'midnight',
        'rose', 'crimson', 'amethyst', 'gold', 'arctic'
      )
    );

comment on column public.profiles.theme_color is
  'Paleta de cores da interface (independente de theme_preference, o modo claro/escuro).';

grant update (theme_color) on table public.profiles to authenticated;
