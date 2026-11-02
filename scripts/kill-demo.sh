#!/usr/bin/env bash
# PixelQ kill demo: start two workers with short demo timings, upload an image,
# SIGKILL the worker that is processing it, and show that the other worker
# picks the job up again and finishes it.
#
# Options (environment variables):
#   RUNS                      how many times to repeat the demo (default 1)
#   RECOVERY_TIMEOUT_SECONDS  how long to wait for the recovery (default 90)
#   BASE_URL                  gateway address (default http://127.0.0.1:8080)
set -euo pipefail

cd "$(dirname "$0")/.."

# Base file plus the demo settings. The smoke test and CI never use the demo file.
export COMPOSE_FILE=docker-compose.yml:docker-compose.demo.yml

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
RUNS="${RUNS:-1}"
RECOVERY_TIMEOUT_SECONDS="${RECOVERY_TIMEOUT_SECONDS:-90}"
TMP_DIR="$(mktemp -d)"

restore() {
  rm -rf "$TMP_DIR"
  echo "Restoring the normal stack (base compose file only, one worker)"
  COMPOSE_FILE=docker-compose.yml docker compose up -d --wait --wait-timeout 300 >/dev/null 2>&1 \
    || echo "WARNING: could not restore the normal stack. Run: docker compose up -d --wait" >&2
}
trap restore EXIT

fail() {
  echo "FAIL: $*" >&2
  docker compose ps -a >&2 || true
  docker compose logs --tail=30 worker >&2 || true
  exit 1
}

job_status() {
  curl -fsS "$BASE_URL/api/jobs/$1" 2>/dev/null \
    | grep -o '"status":"[a-z_]*"' | head -n 1 | cut -d '"' -f 4 || true
}

for RUN in $(seq 1 "$RUNS"); do
  echo "=== Run $RUN of $RUNS ==="

  echo "1/6 Building the worker and starting 2 workers with the demo settings"
  docker compose --progress=quiet build worker || fail "the worker image did not build"
  docker compose up -d --scale worker=2 --wait --wait-timeout 300 \
    || fail "the stack did not become healthy with 2 workers"

  echo "2/6 Uploading an image"
  IMAGE="$TMP_DIR/demo-$RUN.png"
  (cd worker && node -e '
const sharp = require("sharp");
sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 120, b: 200 } } })
  .png()
  .toFile(process.argv[1])
  .catch((e) => { console.error(e); process.exit(1); });
' "$IMAGE") || fail "could not create the test image (did you run pnpm install?)"
  RESPONSE="$(curl -sS -w '\n%{http_code}' -F "file=@$IMAGE;type=image/png" "$BASE_URL/api/jobs")" \
    || fail "the upload request did not complete"
  CODE="$(printf '%s' "$RESPONSE" | tail -n 1)"
  BODY="$(printf '%s' "$RESPONSE" | sed '$d')"
  [ "$CODE" = "202" ] || fail "upload returned HTTP $CODE (expected 202): $BODY"
  JOB_ID="$(printf '%s' "$BODY" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d '"' -f 4 || true)"
  [ -n "$JOB_ID" ] || fail "no job id in the upload response: $BODY"
  echo "    job id: $JOB_ID"

  echo "3/6 Waiting until the job is processing"
  SECONDS=0
  while [ "$(job_status "$JOB_ID")" != "processing" ]; do
    [ "$SECONDS" -lt 15 ] || fail "the job never reached 'processing'"
    sleep 0.5
  done

  echo "4/6 Finding the worker that has the job"
  VICTIM=""
  for CID in $(docker compose ps -q worker); do
    if docker logs "$CID" 2>&1 | grep -q "Processing job .*$JOB_ID"; then
      VICTIM="$CID"
    fi
  done
  [ -n "$VICTIM" ] || fail "no worker logged the job"
  VICTIM_NAME="$(docker inspect -f '{{.Name}}' "$VICTIM")"
  VICTIM_NAME="${VICTIM_NAME#/}"
  echo "    $VICTIM_NAME has the job"

  echo "5/6 Killing $VICTIM_NAME with SIGKILL and waiting for the recovery"
  START="$(date +%s)"
  docker kill "$VICTIM" >/dev/null || fail "docker kill failed"
  STATUS=""
  while [ "$STATUS" != "done" ]; do
    ELAPSED=$(( $(date +%s) - START ))
    [ "$ELAPSED" -lt "$RECOVERY_TIMEOUT_SECONDS" ] || fail "the job was not done ${RECOVERY_TIMEOUT_SECONDS}s after the kill (last status: '$STATUS')"
    STATUS="$(job_status "$JOB_ID")"
    [ "$STATUS" != "failed" ] || fail "the job ended as failed instead of being recovered"
    sleep 1
  done
  ELAPSED=$(( $(date +%s) - START ))
  echo "    done ${ELAPSED}s after the kill"

  ROW="$(docker compose exec -T postgres psql -U pixelq -d pixelq -tAc \
    "select status, attempts from jobs where id = '$JOB_ID'" | tr -d '\r')" \
    || fail "could not read the job from Postgres"
  IFS='|' read -r DB_STATUS DB_ATTEMPTS <<< "$ROW"
  echo "    database: status=$DB_STATUS attempts=$DB_ATTEMPTS"
  [ "$DB_STATUS" = "done" ] || fail "database status is '$DB_STATUS' (expected done)"
  [ "${DB_ATTEMPTS:-0}" -ge 2 ] || fail "attempts is '$DB_ATTEMPTS' (expected at least 2: the job must have been started again)"

  echo "6/6 Checking the results and the log lines"
  for VARIANT in thumbnail medium full; do
    RESULT="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$BASE_URL/api/files/$JOB_ID/$VARIANT" || true)"
    [ "$RESULT" = "200 image/webp" ] || fail "variant '$VARIANT' returned '$RESULT'"
    echo "    $VARIANT: $RESULT"
  done
  docker compose logs --no-color worker 2>&1 | grep "$JOB_ID" | sed 's/^/    /' || true

  echo "RUN $RUN PASSED: recovered ${ELAPSED}s after the kill, attempts=$DB_ATTEMPTS"
  echo
done

echo "KILL DEMO PASSED ($RUNS run(s))"