#!/usr/bin/env bash
set -euo pipefail

# Requires PostgreSQL server binaries; no Docker, Supabase account, or internet.
# A C locale avoids the macOS "postmaster became multithreaded" startup failure.
export LC_ALL=C
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir)}"
if [[ ! -x "$PG_BIN/initdb" ]]; then
  echo 'PostgreSQL server binaries were not found. Set PG_BIN to their bin directory.' >&2
  exit 1
fi
# Unix socket paths are limited to about 100 bytes, so the cluster stays under /tmp.
CLUSTER="$(mktemp -d /tmp/restory-pg.XXXXXX)"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$CLUSTER/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$CLUSTER"
}
trap cleanup EXIT
mkdir "$CLUSTER/socket"
"$PG_BIN/initdb" -D "$CLUSTER/data" --auth=trust --encoding=UTF8 --no-locale >/dev/null
"$PG_BIN/pg_ctl" -D "$CLUSTER/data" -l "$CLUSTER/server.log" -o "-c listen_addresses='' -k '$CLUSTER/socket' -p 55439" start >/dev/null
PSQL=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -h "$CLUSTER/socket" -p 55439 -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/bootstrap.sql" >/dev/null
for migration in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$migration" >/dev/null
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/security.sql" >/dev/null
echo 'Restory database security checks passed in a disposable PostgreSQL cluster.'
