#!/usr/bin/env bash
# PixelQ smoke test: start the stack, upload an image through the gateway,
# wait for it to be processed, check the results. Exits 1 on any failure.
#
# Options (environment variables):
#   BASE_URL         where the gateway listens (default http://127.0.0.1:8080)
#   TIMEOUT_SECONDS  how long to wait for the job to finish (default 60)
#   SMOKE_DOWN=1     run "docker compose down" at the end (never removes volumes)
set -euo pipefail

cd "$(dirname "$0")/.."

# Base compose file only. An exported variable wins over the one in .env,
# so a local dev override cannot change what this test checks.
export COMPOSE_FILE=docker-compose.yml

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
  if [ "${SMOKE_DOWN:-0}" = "1" ]; then
    docker compose down
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  echo "--- docker compose ps ---" >&2
  docker compose ps >&2 || true
  echo "--- last log lines ---" >&2
  docker compose logs --tail=30 >&2 || true
  exit 1
}

echo "1/6 Starting the stack (base compose file only)"
docker compose up -d --wait --wait-timeout 300 || fail "the stack did not become healthy"

echo "2/6 Checking the gateway and the page"
curl -fsS -o /dev/null "$BASE_URL/healthz" || fail "$BASE_URL/healthz did not answer"
curl -fsS -o /dev/null "$BASE_URL/" || fail "the page at $BASE_URL/ did not load"

echo "3/6 Creating a test image and uploading it"
IMAGE="$TMP_DIR/smoke.png"
(cd worker && node -e '
const sharp = require("sharp");
sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 80, b: 40 } } })
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

echo "4/6 Waiting for the job to be done (up to ${TIMEOUT_SECONDS}s)"
SECONDS=0
LAST=""
STATUS=""
while [ "$SECONDS" -lt "$TIMEOUT_SECONDS" ]; do
  LAST="$(curl -fsS "$BASE_URL/api/jobs/$JOB_ID" || true)"
  STATUS="$(printf '%s' "$LAST" | grep -o '"status":"[a-z_]*"' | head -n 1 | cut -d '"' -f 4 || true)"
  case "$STATUS" in
    done) break ;;
    failed|enqueue_failed) fail "the job ended as $STATUS: $LAST" ;;
  esac
  sleep 1
done
[ "$STATUS" = "done" ] || fail "the job was not done after ${TIMEOUT_SECONDS}s (last status: '${STATUS}', last response: $LAST)"
echo "    done after ${SECONDS}s"

echo "5/6 Downloading the three variants"
for VARIANT in thumbnail medium full; do
  RESULT="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$BASE_URL/api/files/$JOB_ID/$VARIANT" || true)"
  [ "$RESULT" = "200 image/webp" ] || fail "variant '$VARIANT' returned '$RESULT' (expected '200 image/webp')"
  echo "    $VARIANT: $RESULT"
done

echo "6/6 Checking that a non-image upload is refused"
echo "this is not an image" > "$TMP_DIR/not-an-image.txt"
BAD_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -F "file=@$TMP_DIR/not-an-image.txt;type=image/png" "$BASE_URL/api/jobs" || true)"
[ "$BAD_CODE" = "415" ] || fail "a text file returned HTTP $BAD_CODE (expected 415)"
echo "    text file: $BAD_CODE"

echo "SMOKE TEST PASSED"