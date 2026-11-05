#!/usr/bin/env bash
# =============================================================================
# Pilha Supabase local e descartável para testes ponta a ponta — SEM Docker.
#
# Usa os binários OFICIAIS (baixados do GitHub na 1ª vez para supabase/stack/.bin):
#   * Supabase Auth (GoTrue) — cadastro, confirmação por e-mail, login, PKCE, JWT;
#   * PostgREST — a mesma API REST do Supabase, com RLS e max_rows = 1000;
#   * gateway.mjs — papel do Kong (rotas /auth/v1 e /rest/v1, header apikey, chaves
#     sb_publishable_/sb_secret_) e uma caixa de e-mail de teste compatível com o Mailpit.
#
# O banco é criado DO ZERO a cada execução: papéis do Supabase → migrations oficiais do
# Auth → migrations do LifeOS (supabase/migrations, em ordem). Nada de dados pessoais:
# as duas contas de teste são criadas aqui, com e-mails @example.test.
#
# Requisitos: Linux x86-64, Node 22+, psql e um PostgreSQL 15+ acessível por TCP.
# Variáveis: PGHOST (127.0.0.1), PGPORT (5432), PGUSER (postgres), PGPASSWORD,
#            STACK_DB (lifeos_stack).
#
# No Windows/macOS use o fluxo oficial com Docker (`npx supabase start`); veja
# docs/testing.md. Parar: bash supabase/stack/stop.sh
# =============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin="$here/.bin"
state="$here/.state"
mkdir -p "$bin" "$state"

AUTH_VERSION="v2.180.0"
POSTGREST_VERSION="v13.0.7"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
db="${STACK_DB:-lifeos_stack}"

bash "$here/stop.sh" >/dev/null 2>&1 || true

# --- binários -----------------------------------------------------------------------
if [[ ! -x "$bin/postgrest" ]]; then
  echo "▶ Baixando PostgREST $POSTGREST_VERSION"
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz" | tar xJ -C "$bin"
fi
if [[ ! -x "$bin/auth/auth" ]]; then
  echo "▶ Baixando Supabase Auth $AUTH_VERSION"
  mkdir -p "$bin/auth"
  curl -fsSL "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" | tar xz -C "$bin/auth"
fi

# --- segredos descartáveis desta execução --------------------------------------------
rand() { node -e "process.stdout.write(require('crypto').randomBytes($1).toString('hex'))"; }
JWT_SECRET="$(rand 32)"
PUBLISHABLE="sb_publishable_stack_$(rand 12)"
SECRET="sb_secret_stack_$(rand 16)"

# --- banco ----------------------------------------------------------------------------
echo "▶ Banco limpo: $db"
psql -X -q -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $db with (force)" -c "create database $db"
psql_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
psql_db -v dbname="$db" -f "$here/roles.sql" >/dev/null

echo "▶ Migrations do Supabase Auth"
auth_env=(
  GOTRUE_DB_DRIVER=postgres
  "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:auth-admin-local@$PGHOST:$PGPORT/$db?sslmode=disable"
  GOTRUE_DB_MIGRATIONS_PATH="$bin/auth/migrations"
  GOTRUE_API_HOST=127.0.0.1 PORT=9999
  API_EXTERNAL_URL=http://localhost:54321
  GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
  GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
  GOTRUE_SITE_URL=http://localhost:4173
  "GOTRUE_URI_ALLOW_LIST=http://localhost:4173/**,http://localhost:5173/**"
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
  GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true
  GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true
  GOTRUE_PASSWORD_MIN_LENGTH=8
  GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=nao-responda@lifeos.test
  GOTRUE_SMTP_SENDER_NAME=LifeOS GOTRUE_SMTP_MAX_FREQUENCY=1s
  GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_RATE_LIMIT_VERIFY=1000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=1000
  GOTRUE_RATE_LIMIT_OTP=1000
  GOTRUE_LOG_LEVEL=warn
)
env "${auth_env[@]}" "$bin/auth/auth" migrate >"$state/auth-migrate.log" 2>&1 || { cat "$state/auth-migrate.log"; exit 1; }
psql_db -f "$here/after-auth.sql" >/dev/null
psql_db -f "$root/supabase/tests/local/storage-shim.sql" >/dev/null

echo "▶ Migrations do LifeOS"
for f in "$root"/supabase/migrations/*.sql; do
  echo "  · $(basename "$f")"
  psql_db -f "$f" >/dev/null
done

# --- serviços -------------------------------------------------------------------------
cat >"$state/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:authenticator-local@$PGHOST:$PGPORT/$db"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-max-rows = 1000
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3000
log-level = "warn"
EOF

start() { # nome comando...
  local name=$1; shift
  nohup "$@" >"$state/$name.log" 2>&1 &
  echo $! >"$state/$name.pid"
}
start auth env "${auth_env[@]}" "$bin/auth/auth" serve
start postgrest "$bin/postgrest" "$state/postgrest.conf"
start gateway env STACK_JWT_SECRET="$JWT_SECRET" STACK_PUBLISHABLE_KEY="$PUBLISHABLE" STACK_SECRET_KEY="$SECRET" node "$here/gateway.mjs"

wait_for() { # url descrição
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null 2>/dev/null "$1" -H "apikey: $PUBLISHABLE"; then return 0; fi
    sleep 0.5
  done
  echo "✗ $2 não respondeu. Logs em $state/"; tail -20 "$state"/*.log; exit 1
}
wait_for "http://127.0.0.1:54321/auth/v1/health" "Auth"
wait_for "http://127.0.0.1:54321/rest/v1/" "PostgREST"

# --- contas de teste (via API de administração, só nesta pilha) -----------------------
make_user() { # email senha
  curl -fsS -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
    -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true,\"user_metadata\":{\"display_name\":\"Conta de teste\"}}" >/dev/null
}
PASS_A="Teste-$(rand 6)"
PASS_B="Teste-$(rand 6)"
make_user "conta-a@example.test" "$PASS_A"
make_user "conta-b@example.test" "$PASS_B"

# .env.stack.local: lido com `--mode stack` (Vite/Vitest) e pelo Playwright. Fica fora do Git.
cat >"$root/.env.stack.local" <<EOF
# Gerado por supabase/stack/start.sh — pilha LOCAL descartável. Não é um projeto real.
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE
LIFEOS_TEST_A_EMAIL=conta-a@example.test
LIFEOS_TEST_A_PASSWORD=$PASS_A
LIFEOS_TEST_B_EMAIL=conta-b@example.test
LIFEOS_TEST_B_PASSWORD=$PASS_B
E2E_MAIL_API=http://localhost:54324
EOF

echo "✓ Pilha pronta: API http://localhost:54321 · e-mails http://localhost:54324 · banco $db"
echo "  Variáveis em .env.stack.local (a chave secreta desta pilha não é gravada em lugar nenhum)."
