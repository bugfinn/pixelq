#!/usr/bin/env bash
# PixelQ hardening check: proves the security controls on the worker container(s)
# really work, instead of trusting the compose file. Exits 1 if any check fails.
#
# Start the stack first (docker compose up -d --wait).
# Options (environment variables):
#   WORKER_CONTAINERS  container names or ids to check instead of the compose
#                      workers (used to test that this script can fail)
set -euo pipefail

cd "$(dirname "$0")/.."

# Base compose file only (see scripts/smoke-test.sh)
export COMPOSE_FILE=docker-compose.yml

WORKERS="${WORKER_CONTAINERS:-$(docker compose ps -q worker || true)}"
if [ -z "$WORKERS" ]; then
  echo "No running worker container. Start the stack first: docker compose up -d --wait" >&2
  exit 1
fi

FAILURES=0
pass() { echo "  [PASS] $*"; }
bad() { echo "  [FAIL] $*"; FAILURES=$((FAILURES + 1)); }

ZEROS=0000000000000000

for ID in $WORKERS; do
  NAME="$(docker inspect -f '{{.Name}}' "$ID")"
  echo "Worker container: ${NAME#/}"

  echo "1/5 Read-only root filesystem"
  if docker exec "$ID" touch /tmp/pixelq-control >/dev/null 2>&1; then
    if OUT="$(docker exec "$ID" touch /pixelq-write-test 2>&1)"; then
      docker exec "$ID" rm -f /pixelq-write-test >/dev/null 2>&1 || true
      bad "a write to / succeeded: the root filesystem is writable"
    elif printf '%s' "$OUT" | grep -q "Read-only file system"; then
      pass "write to / refused ($OUT); /tmp is writable as intended"
    else
      bad "write to / failed, but not with a read-only error: $OUT"
    fi
  else
    bad "control failed: could not write to /tmp, so this check proves nothing"
  fi

  echo "2/5 No capabilities, no new privileges"
  STATUS="$(docker exec "$ID" cat /proc/1/status)"
  EFF="$(printf '%s\n' "$STATUS" | awk '/^CapEff:/ {print $2}')"
  BND="$(printf '%s\n' "$STATUS" | awk '/^CapBnd:/ {print $2}')"
  NNP="$(printf '%s\n' "$STATUS" | awk '/^NoNewPrivs:/ {print $2}')"
  if [ "$EFF" = "$ZEROS" ] && [ "$BND" = "$ZEROS" ] && [ "$NNP" = "1" ]; then
    pass "CapEff=$EFF CapBnd=$BND NoNewPrivs=$NNP"
  else
    bad "CapEff=$EFF CapBnd=$BND NoNewPrivs=$NNP (expected all zeros and 1)"
  fi

  echo "3/5 No outbound internet"
  if docker exec "$ID" node -e '
fetch("http://api:3000/api/health", { signal: AbortSignal.timeout(5000) })
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch(() => process.exit(1));
' >/dev/null 2>&1; then
    if OUT="$(docker exec "$ID" node -e '
fetch("https://example.com", { signal: AbortSignal.timeout(5000) })
  .then(() => { console.log("reached the internet"); process.exit(42); })
  .catch((e) => { console.log("blocked: " + (e.cause?.code ?? e.name)); });
' 2>&1)"; then
      pass "public site unreachable ($OUT); the api is reachable on the internal network"
    else
      bad "the worker can reach the public internet ($OUT)"
    fi
  else
    bad "control failed: the worker cannot reach http://api:3000/api/health, so this check proves nothing"
  fi

  echo "4/5 Memory and CPU limits"
  read -r MEM SWAP CPUS <<< "$(docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}}' "$ID")"
  if [ "$MEM" -gt 0 ] && [ "$SWAP" -eq "$MEM" ] && [ "$CPUS" -gt 0 ]; then
    CPU_VALUE="$(awk -v n="$CPUS" 'BEGIN { printf "%.2f", n / 1000000000 }')"
    pass "memory $((MEM / 1048576)) MB, swap limit $((SWAP / 1048576)) MB (equal), CPU limit $CPU_VALUE"
  else
    bad "memory=$MEM swap=$SWAP nanocpus=$CPUS (expected memory > 0, swap equal to memory, cpus > 0)"
  fi

  echo "5/5 Non-root user"
  USER_ID="$(docker exec "$ID" id -u)"
  USER_LINE="$(docker exec "$ID" id)"
  if [ "$USER_ID" != "0" ]; then
    pass "$USER_LINE"
  else
    bad "the container runs as root: $USER_LINE"
  fi
done

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "HARDENING CHECKS PASSED"
else
  echo "HARDENING CHECKS FAILED ($FAILURES failed)"
  exit 1
fi