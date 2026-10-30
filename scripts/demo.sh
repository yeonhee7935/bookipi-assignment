#!/usr/bin/env bash
# Starts the stack and creates a sale that opens STARTS_IN seconds from now
# and stays open for DURATION seconds.
#
#   ./scripts/demo.sh                                   # opens in 30s, runs 10 min, 100 units
#   STARTS_IN=10 DURATION=120 SALE_STOCK=5 ./scripts/demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Starting stack"
docker compose --progress quiet up -d --build --wait

# Created after the stack is up, so a slow build does not eat into the countdown.
echo "==> Creating sale"
docker compose --progress quiet run --rm --no-deps api node dist/cli/create-sale.js --replace \
  --stock "${SALE_STOCK:-100}" --starts-in "${STARTS_IN:-30}" --duration "${DURATION:-600}"

echo "==> Open http://localhost:8080"
