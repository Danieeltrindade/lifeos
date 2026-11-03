-- =============================================================================
-- 11ª paleta de cores: 'mono' (preto e branco).
--
-- Só amplia a lista aceita por profiles.theme_color; valores salvos, padrão ('ocean'),
-- GRANT e RLS continuam os da migration 20261103120000_theme_color.sql.
-- =============================================================================

alter table public.profiles drop constraint profiles_theme_color_valid;

alter table public.profiles
  add constraint profiles_theme_color_valid check (
    theme_color in (
      'ocean', 'nebula', 'forest', 'ember', 'midnight',
      'rose', 'crimson', 'amethyst', 'gold', 'arctic', 'mono'
    )
  );
