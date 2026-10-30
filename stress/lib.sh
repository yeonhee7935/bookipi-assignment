# Shared helpers for the stress scripts (sourced, not executed).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Creates a timestamped folder for one run's artifacts and prints its path.
new_result_dir() {
  local dir="${RESULT_PARENT:-stress/results}/$(date -u +%Y%m%dT%H%M%SZ)-$1"
  mkdir -p "$dir"
  chmod a+rwx "$dir" # the k6 container writes here with its own uid
  echo "$dir"
}

# Starts (or rescales) the stack. Honours API_REPLICAS and API_CPUS.
start_stack() {
  docker compose --progress quiet up -d --build --wait
  # nginx resolves the API replicas when it starts; restart it so a rescale is picked up.
  docker compose restart web >/dev/null
  until curl -fs -o /dev/null http://localhost:8080/health 2>/dev/null ||
    curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/sale | grep -qE '200|404'; do
    sleep 0.5
  done
}

# Creates a sale that is open right away. $1 = stock
create_sale() {
  docker compose --progress quiet run --rm --no-deps api node dist/cli/create-sale.js --replace \
    --stock "$1" --starts-in 0 --duration 3600
}

# Runs a k6 script against nginx. $1 = script in stress/, $2 = result dir.
# Writes summary.json and an HTML report (report.html) into the result dir.
run_k6() {
  docker compose --profile stress run --rm \
    -e RESULT_DIR="/$2" -e API_REPLICAS \
    -e K6_WEB_DASHBOARD=true -e K6_WEB_DASHBOARD_EXPORT="/$2/report.html" \
    -e PEAK_RATE -e DURATION -e GREEDY_USERS -e GREEDY_VUS -e STEPS -e STEP_DURATION -e MAX_VUS \
    k6 "/stress/$1" || echo "(k6 reported threshold failures, see above)"
}

# Checks the invariants in Redis and Postgres; output also saved to verify.txt. $1 = result dir
verify() {
  docker compose run --rm -T --no-deps -v "$PWD/$1:/results" api \
    node dist/cli/verify.js /results/summary.json | tee "$1/verify.txt"
}
