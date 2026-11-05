#!/usr/bin/env bash
# =============================================================================
# Valida as migrations e roda os testes pgTAP em um PostgreSQL puro (sem Docker).
#
# Cria um banco NOVO a cada execução (verifica "migrations em ambiente limpo"),
# aplica o shim do Supabase, todas as migrations em ordem e cada arquivo de
# supabase/tests/database/*.test.sql. Falha se qualquer passo falhar ou se algum
# teste reportar "not ok".
#
# Requisitos: psql, um servidor PostgreSQL 15+ acessível e a extensão pgTAP instalada.
# Variáveis (padrões entre parênteses): PGHOST, PGPORT, PGUSER (postgres), LIFEOS_TEST_DB (lifeos_test).
#
# No fluxo oficial com Docker use `npx supabase db reset` + `npx supabase test db`.
# =============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
db="${LIFEOS_TEST_DB:-lifeos_test}"
export PGUSER="${PGUSER:-postgres}"

psql_db() { psql -X -v ON_ERROR_STOP=1 -q -d "$db" "$@"; }

echo "▶ Banco limpo: $db"
psql -X -q -d postgres -c "drop database if exists $db with (force)" -c "create database $db"

echo "▶ Shim do Supabase"
psql_db -f "$here/supabase-shim.sql" >/dev/null
psql_db -f "$here/storage-shim.sql" >/dev/null

echo "▶ Migrations"
for f in "$root"/migrations/*.sql; do
  echo "  · $(basename "$f")"
  psql_db -f "$f" >/dev/null
done

echo "▶ Testes pgTAP"
failed=0
total_ok=0
shopt -s nullglob
for t in "$root"/tests/database/*.test.sql; do
  out="$(psql -X -q -t -A -v ON_ERROR_STOP=1 -d "$db" -f "$t" 2>&1)" || {
    echo "  ✗ $(basename "$t") (erro de execução)"; echo "$out" | sed 's/^/      /'; failed=1; continue; }
  oks=$(grep -c '^ok ' <<<"$out" || true)
  bad=$(grep -E '^not ok ' <<<"$out" || true)
  plan_fail=$(grep -E '^# Looks like' <<<"$out" || true)
  total_ok=$((total_ok + oks))
  if [[ -n "$bad" || -n "$plan_fail" ]]; then
    echo "  ✗ $(basename "$t")"
    grep -E -A3 '^not ok |^# Looks like' <<<"$out" | sed 's/^/      /'
    failed=1
  else
    echo "  ✓ $(basename "$t") ($oks asserções)"
  fi
done

if [[ $failed -ne 0 ]]; then
  echo "✗ Falhas encontradas."
  exit 1
fi
echo "✓ Migrations aplicadas em banco limpo e $total_ok asserções pgTAP passaram."
