#!/usr/bin/env bash
# รันทดสอบระบบผู้แนะนำบน Postgres ชั่วคราวใน Docker (ไม่แตะฐานจริง) แล้วลบทิ้ง
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE="${PG_IMAGE:-pgvector/pgvector:0.8.6-pg18}"
NAME="referral-test-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test \
  -v "$(pwd -W 2>/dev/null || pwd)/supabase/migrations:/mig:ro" \
  -v "$(pwd -W 2>/dev/null || pwd)/supabase/tests:/t:ro" "$IMAGE" >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -q; do sleep 1; done
sleep 1
MSYS_NO_PATHCONV=1 docker exec "$NAME" psql -U postgres -q -o /dev/null -v ON_ERROR_STOP=1 -f /t/referral_revenue_share.test.sql
