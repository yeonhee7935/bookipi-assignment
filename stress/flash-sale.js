// Flash sale stress test. Three traffic patterns run at the same time:
//   crowd   - a surge of distinct users trying to buy (far more than the stock)
//   greedy  - a few users hammering "Buy" repeatedly, in parallel
//   viewers - users polling the sale status page
// Tune with env vars: PEAK_RATE (purchases/s), DURATION, GREEDY_USERS, GREEDY_VUS.
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const PEAK_RATE = Number(__ENV.PEAK_RATE || 2000);
const DURATION = __ENV.DURATION || '30s';
const GREEDY_USERS = Number(__ENV.GREEDY_USERS || 20);
const GREEDY_VUS = Number(__ENV.GREEDY_VUS || 100);

const notActive = new Counter('purchase_not_active');
const outcomes = {
  SUCCESS: new Counter('purchase_success'),
  ALREADY_PURCHASED: new Counter('purchase_already_purchased'),
  SOLD_OUT: new Counter('purchase_sold_out'),
  NOT_STARTED: notActive,
  ENDED: notActive,
};
const unexpected = new Counter('purchase_unexpected');

const SCENARIOS = ['crowd', 'greedy', 'viewers'];
const OUTCOME_METRICS = ['purchase_success', 'purchase_already_purchased', 'purchase_sold_out', 'purchase_unexpected'];

// Business rejections are correct answers, not failures.
http.setResponseCallback(http.expectedStatuses(200, 201, 403, 409, 410));

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    crowd: {
      executor: 'ramping-arrival-rate',
      exec: 'crowd',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 3000,
      stages: [
        { target: PEAK_RATE, duration: '5s' }, // the sale opens: traffic spikes
        { target: PEAK_RATE, duration: DURATION }, // sustained peak
        { target: 0, duration: '5s' },
      ],
    },
    greedy: {
      executor: 'constant-vus',
      exec: 'greedy',
      vus: GREEDY_VUS,
      duration: '20s',
    },
    viewers: {
      executor: 'constant-arrival-rate',
      exec: 'viewer',
      rate: 200,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    purchase_unexpected: ['count==0'],
    'http_req_duration{scenario:crowd}': ['p(95)<500'],
    ...perScenarioMetrics(),
  },
};

// k6 only reports tagged sub-metrics that have a threshold, so register always-true
// thresholds to get request counts, latency and outcomes broken down per scenario.
function perScenarioMetrics() {
  const metrics = {};
  for (const scenario of SCENARIOS) {
    metrics[`http_reqs{scenario:${scenario}}`] = ['count>=0'];
    metrics[`http_req_duration{scenario:${scenario}}`] = ['max>=0'];
    for (const outcome of OUTCOME_METRICS) metrics[`${outcome}{scenario:${scenario}}`] = ['count>=0'];
  }
  return metrics;
}

function purchase(userId) {
  const res = http.post(`${BASE_URL}/api/purchases`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'purchase' },
  });
  const result = res.status < 500 && res.status !== 0 ? res.json('result') : undefined;
  if (outcomes[result]) outcomes[result].add(1);
  else unexpected.add(1);
  check(res, { 'purchase answered': () => result !== undefined });
}

// Runs once; its return value is shared by every VU. (Init code runs once per VU, so a
// run id computed there would differ between VUs and give each greedy VU its own user.)
export function setup() {
  return { runId: __ENV.RUN_ID || Date.now().toString(36) };
}

export function crowd({ runId }) {
  purchase(`crowd-${runId}-${exec.scenario.iterationInTest}`);
}

// GREEDY_VUS VUs share GREEDY_USERS ids, so each id is used by several VUs at the same time.
export function greedy({ runId }) {
  purchase(`greedy-${runId}-${exec.vu.idInTest % GREEDY_USERS}`);
}

export function viewer() {
  const res = http.get(`${BASE_URL}/api/sale`, { tags: { name: 'status' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}

export function handleSummary(data) {
  return {
    [`${__ENV.RESULT_DIR || '/stress/results'}/summary.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const values = (name) => data.metrics[name]?.values;
  const count = (name) => values(name)?.count ?? 0;
  const ms = (v) => `${v.toFixed(1)}ms`.padStart(8);
  const durationSec = data.state.testRunDurationMs / 1000;

  const rows = SCENARIOS.map((scenario) => {
    const tag = `{scenario:${scenario}}`;
    const reqs = count(`http_reqs${tag}`);
    const d = values(`http_req_duration${tag}`);
    const outcomes =
      scenario === 'viewers'
        ? 'status polling'
        : `201=${count(`purchase_success${tag}`)} 409=${count(`purchase_already_purchased${tag}`)} ` +
          `410=${count(`purchase_sold_out${tag}`)} err=${count(`purchase_unexpected${tag}`)}`;
    return (
      `${scenario.padEnd(8)} ${String(reqs).padStart(8)} ${String(Math.round(reqs / durationSec)).padStart(7)}` +
      `${ms(d.med)}${ms(d['p(95)'])}${ms(d['p(99)'])}   ${outcomes}`
    );
  });

  const thresholdsOk = Object.values(data.metrics).every((m) => Object.values(m.thresholds ?? {}).every((t) => t.ok));

  return [
    '',
    '========================= Flash sale stress test =========================',
    `scenario requests   req/s     p50     p95     p99   outcomes`,
    ...rows,
    '--------------------------------------------------------------------------',
    `total    ${String(count('http_reqs')).padStart(8)} ${String(Math.round(values('http_reqs').rate)).padStart(7)}` +
      `   (${durationSec.toFixed(0)}s run; req/s averaged over the whole run)`,
    `purchases: SUCCESS=${count('purchase_success')} ALREADY_PURCHASED=${count('purchase_already_purchased')} ` +
      `SOLD_OUT=${count('purchase_sold_out')} NOT_ACTIVE=${count('purchase_not_active')} errors=${count('purchase_unexpected')}`,
    `thresholds: ${thresholdsOk ? 'PASSED' : 'FAILED'}`,
    '--------------------------------------------------------------------------',
    `crowd    the opening rush: up to ${PEAK_RATE} new users/s, each tries to buy once`,
    `greedy   ${GREEDY_VUS} virtual users hammering "Buy" for ${GREEDY_USERS} user IDs: expect one 201 per ID`,
    'viewers  open sale pages polling the status',
    'outcomes 201 bought · 409 already bought · 410 sold out · err unexpected (5xx, network)',
    'p50/p95/p99: half / 95% / 99% of requests answered within this time',
    'Correct when the 201s add up to the stock and errors=0; verify below checks the stored state.',
    '==========================================================================',
    '',
  ].join('\n');
}
