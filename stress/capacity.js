// Capacity test: an open-model load (arrivals do not wait for responses, like a real
// crowd) raised step by step. Each request is a new user and stock is effectively
// unlimited, so every request takes the full purchase path.
//
// A step passes when the system keeps up: achieved rate >= 95% of target,
// p99 < 50 ms and error rate < 0.1%. Steps are judged independently, so one transient
// latency spike does not hide the steps above it; the highest passing step is the capacity.
// compare.sh repeats runs and judges each step on the median across runs.
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const STEPS = (__ENV.STEPS || '4000,8000,16000,24000,28000,32000,36000,40000,44000').split(',').map(Number);
const HOLD_S = Number(__ENV.STEP_DURATION || 10);
const RAMP_S = 2;
const RESULT_DIR = __ENV.RESULT_DIR || '/stress/results';
const PASS = { minAchieved: 0.95, maxP99Ms: 50, maxErrorRate: 0.001 };

const success = new Counter('purchase_success');
const failed = new Counter('purchase_failed');

http.setResponseCallback(http.expectedStatuses(201));

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    capacity: {
      executor: 'ramping-arrival-rate',
      startRate: STEPS[0],
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: Number(__ENV.MAX_VUS || 10000),
      stages: STEPS.flatMap((target) => [
        { target, duration: `${RAMP_S}s` },
        { target, duration: `${HOLD_S}s` },
      ]),
    },
  },
  // k6 only reports tagged sub-metrics that have a threshold: register always-true ones per step.
  thresholds: Object.fromEntries(
    STEPS.flatMap((_, i) => [
      [`http_reqs{step:${i}}`, ['count>=0']],
      [`http_req_duration{step:${i}}`, ['max>=0']],
      [`purchase_success{step:${i}}`, ['count>=0']],
      [`purchase_failed{step:${i}}`, ['count>=0']],
    ]),
  ),
};

export function setup() {
  return { runId: Date.now().toString(36), start: Date.now() };
}

// Only the steady part of each step is measured; ramps are tagged separately.
function stepAt(elapsedMs) {
  const period = (RAMP_S + HOLD_S) * 1000;
  const index = Math.floor(elapsedMs / period);
  const steady = elapsedMs % period >= RAMP_S * 1000;
  return index < STEPS.length && steady ? String(index) : 'ramp';
}

export default function ({ runId, start }) {
  const step = stepAt(Date.now() - start);
  const res = http.post(
    `${BASE_URL}/api/purchases`,
    JSON.stringify({ userId: `cap-${runId}-${exec.scenario.iterationInTest}` }),
    { headers: { 'Content-Type': 'application/json' }, tags: { step } },
  );
  (res.status === 201 ? success : failed).add(1, { step });
}

export function handleSummary(data) {
  const values = (name) => data.metrics[name]?.values ?? {};
  const rows = STEPS.map((target, i) => {
    const requests = values(`http_reqs{step:${i}}`).count ?? 0;
    const duration = values(`http_req_duration{step:${i}}`);
    const errors = values(`purchase_failed{step:${i}}`).count ?? 0;
    const row = {
      target,
      achievedRps: requests / HOLD_S,
      purchaseTps: (values(`purchase_success{step:${i}}`).count ?? 0) / HOLD_S,
      p50: duration.med ?? null,
      p95: duration['p(95)'] ?? null,
      p99: duration['p(99)'] ?? null,
      errorRate: requests ? errors / requests : 0,
    };
    row.keptUp = row.achievedRps >= target * PASS.minAchieved;
    row.passed = requests > 0 && row.keptUp && row.p99 < PASS.maxP99Ms && row.errorRate < PASS.maxErrorRate;
    return row;
  });

  const passed = rows.filter((r) => r.passed);
  const capacity = passed.length ? passed.at(-1).target : 0;
  const above = rows.find((r) => r.target > capacity);
  // If latency was still fine but the target was not reached, the load generator ran out of steam.
  const limitedBy = !above
    ? 'not reached (raise STEPS)'
    : !above.keptUp && above.p99 < PASS.maxP99Ms
      ? 'load generator (k6) could not produce the target rate'
      : 'system under test (latency or errors)';

  const result = {
    apiReplicas: Number(__ENV.API_REPLICAS || 0) || null,
    stepSeconds: HOLD_S,
    pass: PASS,
    rows,
    capacity,
    limitedBy,
    droppedIterations: values('dropped_iterations').count ?? 0,
  };

  const ms = (v) => (v == null ? '-' : `${v.toFixed(1)} ms`);
  const table = [
    '| Target req/s | Achieved req/s | Purchase TPS | p50 | p95 | p99 | Errors | Pass |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.target} | ${Math.round(r.achievedRps)} | ${Math.round(r.purchaseTps)} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${(r.errorRate * 100).toFixed(2)}% | ${r.passed ? 'yes' : 'no'} |`,
    ),
  ].join('\n');
  const report = [
    `## Capacity${result.apiReplicas ? ` (${result.apiReplicas} API replicas)` : ''}`,
    '',
    table,
    '',
    `Capacity: **${capacity} req/s** (highest step with achieved >= 95% of target, p99 < ${PASS.maxP99Ms} ms, errors < 0.1%)`,
    `Limited by: ${limitedBy}`,
    `Dropped iterations (k6 could not start them): ${result.droppedIterations}`,
    '',
  ].join('\n');

  return {
    [`${RESULT_DIR}/summary.json`]: JSON.stringify(data, null, 2),
    [`${RESULT_DIR}/capacity.json`]: JSON.stringify(result, null, 2),
    [`${RESULT_DIR}/steps.md`]: report,
    stdout: `\n${report}\n`,
  };
}
