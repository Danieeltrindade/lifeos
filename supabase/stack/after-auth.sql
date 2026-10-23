-- Executado depois das migrations do Supabase Auth e antes das do LifeOS: o que a plataforma
-- concede sobre o schema auth aos papéis da API.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
