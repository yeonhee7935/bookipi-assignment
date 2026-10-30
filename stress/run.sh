#!/usr/bin/env bash
# Correctness under load: far more buyers than stock, plus users hammering "Buy".
#   create sale -> k6 (flash-sale.js) -> verify invariants
#
#   ./stress/run.sh                              # 100 units
#   SALE_STOCK=20000 CHAOS=api   ./stress/run.sh # kill one API replica mid-test, restart it 5 s later
#   SALE_STOCK=20000 CHAOS=redis ./stress/run.sh # restart Redis mid-test
# (Use a stock large enough to still be selling when the failure hits.)
source "$(dirname "$0")/lib.sh"

inject_failure() {
  sleep 10
  case "${CHAOS:-}" in
    api)
      # Replica numbers change on every rescale, so pick whichever one is running.
      local victim
      victim=$(docker inspect --format '{{.Name}}' "$(docker compose ps -q api | head -1)")
      victim=${victim#/}
      echo ">>> CHAOS: killing $victim"
      docker kill "$victim" >/dev/null
      sleep 5
      docker start "$victim" >/dev/null
      echo ">>> CHAOS: $victim started again" ;;
    redis)
      echo ">>> CHAOS: restarting redis"
      docker compose restart redis >/dev/null
      echo ">>> CHAOS: redis is back" ;;
  esac
}

dir=$(new_result_dir "correctness${CHAOS:+-chaos-$CHAOS}")
echo "==> Starting stack"
start_stack
echo "==> Creating an open sale with ${SALE_STOCK:-100} units"
create_sale "${SALE_STOCK:-100}"
echo "==> Running k6 for about 40 s ${CHAOS:+(CHAOS=$CHAOS)}"
[[ -n "${CHAOS:-}" ]] && inject_failure &
run_k6 flash-sale.js "$dir"
wait
echo "==> Verifying final state (waits until every purchase is in Postgres)"
verify "$dir"
echo "==> Results: $dir (open report.html in a browser)"
