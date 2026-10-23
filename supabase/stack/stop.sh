#!/usr/bin/env bash
# Para os processos da pilha local (supabase/stack/start.sh). O banco fica até o próximo start.
set -uo pipefail
state="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.state"
for name in gateway postgrest auth; do
  if [[ -f "$state/$name.pid" ]]; then
    kill "$(cat "$state/$name.pid")" 2>/dev/null && echo "■ $name parado"
    rm -f "$state/$name.pid"
  fi
done
