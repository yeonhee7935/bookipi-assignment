#!/usr/bin/env bash
# Capacity: raises the purchase rate step by step until the system stops keeping up.
# Every request is a new user and stock is effectively unlimited, so each one takes the
# heaviest path (window + stock + record + outbox event).
#
#   ./stress/capacity.sh                              # 3 API replicas, 1 CPU each
#   API_REPLICAS=1 ./stress/capacity.sh
#   STEPS=500,1000,2000 STEP_DURATION=20 ./stress/capacity.sh
source "$(dirname "$0")/lib.sh"
export API_REPLICAS=${API_REPLICAS:-3}

dir=$(new_result_dir "capacity-${API_REPLICAS}api")
echo "==> Starting stack with $API_REPLICAS API replica(s)"
start_stack
echo "==> Creating an open sale with unlimited stock"
create_sale 100000000
echo "==> Running k6 (steps: ${STEPS:-4000,8000,16000,24000,28000,32000,36000,40000,44000} req/s, ${STEP_DURATION:-10} s each)"
run_k6 capacity.js "$dir"
echo "==> Verifying final state and persistence backlog"
verify "$dir"
echo "==> Results: $dir (open report.html in a browser)"
