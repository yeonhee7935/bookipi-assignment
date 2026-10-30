#!/usr/bin/env bash
# Runs the capacity test for several API replica counts, RUNS times each, and writes
# a comparison (median and range) to stress/results/compare-<time>/compare.md.
#
#   ./stress/compare.sh                    # 1 to 4 replicas, 1 run each (~10 min)
#   CONFIGS="1 3" RUNS=3 ./stress/compare.sh
source "$(dirname "$0")/lib.sh"

export RESULT_PARENT="stress/results/compare-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RESULT_PARENT"

for replicas in ${CONFIGS:-1 2 3 4}; do
  for run in $(seq 1 "${RUNS:-1}"); do
    echo "######## $replicas API replica(s), run $run/${RUNS:-1}"
    API_REPLICAS=$replicas ./stress/capacity.sh
  done
done

docker run --rm -v "$PWD/stress:/stress" node:24-alpine node /stress/aggregate.mjs "/$RESULT_PARENT"
echo "==> Comparison: $RESULT_PARENT/compare.md"
