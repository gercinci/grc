#!/usr/bin/env bash
# Veritabanı kurallarını geçici bir Postgres üzerinde test eder.
# Kullanım:
#   bash supabase/tests/run.sh                 # geçici yerel Postgres başlatır (16+ kurulu olmalı)
#   TEST_DATABASE_URL=postgres://... bash ...  # BOŞ bir test veritabanına karşı çalıştırır
set -euo pipefail
cd "$(dirname "$0")/.."

apply() {
  for f in tests/00_supabase_stub.sql migrations/*.sql tests/*.test.sql; do
    psql "$1" -q -o /dev/null -v ON_ERROR_STOP=1 -f "$f"
  done
}

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  apply "$TEST_DATABASE_URL"
  exit 0
fi

BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[[ -n "$BIN" ]] || BIN="$(dirname "$(command -v initdb)")"
DIR="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
RUN=()
if [[ "$(id -u)" == "0" ]]; then
  chown postgres "$DIR"
  RUN=(runuser -u postgres --)
fi
cleanup() {
  "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

"${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null
apply "postgres://postgres@/postgres?host=$DIR&port=$PORT"
