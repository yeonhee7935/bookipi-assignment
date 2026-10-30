// Combines the runs of a compare.sh session into compare.md and compare.html.
// Each step is judged on the median across runs, which absorbs one-off latency spikes.
//
//   node aggregate.mjs <compare-dir> [<previous-compare-dir>]
//
// With a previous session, the report also compares the means of both sessions.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [dir, previousDir] = process.argv.slice(2);

function loadRuns(sessionDir) {
  return readdirSync(sessionDir)
    .filter((name) => existsSync(join(sessionDir, name, 'capacity.json')))
    .sort()
    .map((name) => {
      const run = JSON.parse(readFileSync(join(sessionDir, name, 'capacity.json'), 'utf8'));
      const verify = existsSync(join(sessionDir, name, 'verify.txt'))
        ? readFileSync(join(sessionDir, name, 'verify.txt'), 'utf8')
        : '';
      const backlog = verify.match(/backlog when load stopped: (\d+) orders, drained in ([\d.]+) s/);
      const purchases = verify.match(/purchases=(\d+) <=/);
      return {
        ...run,
        name,
        hasReport: existsSync(join(sessionDir, name, 'report.html')),
        verifyPassed: verify.includes('PASS') && !verify.includes('FAIL'),
        purchases: purchases ? Number(purchases[1]) : null,
        backlog: backlog ? Number(backlog[1]) : null,
        drainSeconds: backlog ? Number(backlog[2]) : null,
        // Steps judged independently within the run.
        runCapacity: run.rows.filter((r) => r.passed).at(-1)?.target ?? 0,
        peakAchieved: Math.max(...run.rows.map((r) => r.achievedRps)),
      };
    });
}

const stats = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length > 1 ? v.length - 1 : 1));
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { n: v.length, mean, sd, median, min: s[0], max: s.at(-1) };
};

function summarize(runs) {
  const { pass } = runs[0];
  const targets = runs[0].rows.map((r) => r.target);
  return [...Map.groupBy(runs, (r) => r.apiReplicas)]
    .sort(([a], [b]) => a - b)
    .map(([replicas, group]) => {
      const steps = targets.map((target, i) => {
        const rows = group.map((r) => r.rows[i]);
        const p99 = stats(rows.map((r) => r.p99));
        const achieved = stats(rows.map((r) => r.achievedRps));
        const errors = stats(rows.map((r) => r.errorRate));
        const passed =
          achieved.median >= target * pass.minAchieved && p99.median < pass.maxP99Ms && errors.median < pass.maxErrorRate;
        return { target, p99, achieved, passRate: rows.filter((r) => r.passed).length / rows.length, passed };
      });
      const passedSteps = steps.filter((s) => s.passed);
      return {
        replicas,
        runs: group,
        steps,
        capacity: passedSteps.length ? passedSteps.at(-1).target : 0,
        reachedTop: steps.at(-1).passed,
        runCapacity: stats(group.map((r) => r.runCapacity)),
        peakAchieved: stats(group.map((r) => r.peakAchieved)),
        dropped: stats(group.map((r) => r.droppedIterations)),
        backlog: stats(group.map((r) => r.backlog)),
        drain: stats(group.map((r) => r.drainSeconds)),
        allVerified: group.every((r) => r.verifyPassed),
      };
    });
}

const runs = loadRuns(dir);
const configs = summarize(runs);
const previous = previousDir && existsSync(previousDir) ? summarize(loadRuns(previousDir)) : null;
const { pass, stepSeconds } = runs[0];
const targets = runs[0].rows.map((r) => r.target);

const int = (x) => (x == null ? '–' : Math.round(x).toLocaleString('en-US'));
const one = (x) => (x == null ? '–' : x.toFixed(1));
const meanSd = (s, fmt) => (s ? `${fmt(s.mean)} ± ${fmt(s.sd)}` : '–');
const diff = (now, before) => {
  if (!now || !before || !before.mean) return '–';
  const pct = ((now.mean - before.mean) / before.mean) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
};

// ---------- Markdown ----------
const md = [
  '# Capacity comparison',
  '',
  `${runs.length} runs in total, ${stepSeconds} s per step. A step passes when, on the median across runs, the achieved rate is >= ${pass.minAchieved * 100}% of target, p99 < ${pass.maxP99Ms} ms and errors < ${pass.maxErrorRate * 100}%.`,
  '',
  '| API replicas | Runs | Capacity (median rule) | Per-run capacity, mean ± sd | Peak achieved req/s, mean ± sd | All verified |',
  '|---|---|---|---|---|---|',
  ...configs.map(
    (c) =>
      `| ${c.replicas} | ${c.runs.length} | ${int(c.capacity)}${c.reachedTop ? '+' : ''} | ${meanSd(c.runCapacity, int)} | ${meanSd(c.peakAchieved, int)} | ${c.allVerified ? 'yes' : 'NO'} |`,
  ),
  '',
  '### p99 per step (ms): mean ± sd, median',
  '',
  `| Target req/s | ${configs.map((c) => `${c.replicas} replica(s)`).join(' | ')} |`,
  `|---|${configs.map(() => '---').join('|')}|`,
  ...targets.map(
    (t, i) =>
      `| ${int(t)} | ${configs.map((c) => `${meanSd(c.steps[i].p99, one)}, ${one(c.steps[i].p99.median)}${c.steps[i].passed ? '' : ' ✗'}`).join(' | ')} |`,
  ),
  '',
].join('\n');
writeFileSync(join(dir, 'compare.md'), md);

// ---------- HTML ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const COLORS = ['#2759e0', '#e0562f', '#12804a', '#8a5a00'];

function chart() {
  const W = 720;
  const H = 300;
  const pad = { l: 56, r: 16, t: 16, b: 40 };
  const maxY = Math.min(
    200,
    Math.max(60, ...configs.flatMap((c) => c.runs.flatMap((r) => r.rows.map((x) => x.p99 ?? 0)))),
  );
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (targets.length - 1);
  const y = (v) => pad.t + (1 - Math.min(v, maxY) / maxY) * (H - pad.t - pad.b);
  const grid = [0, 25, 50, 100, 150, 200]
    .filter((v) => v <= maxY)
    .map(
      (v) =>
        `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="${v === pass.maxP99Ms ? 'limit' : 'grid'}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
    )
    .join('');
  const xs = targets
    .map((t, i) => `<text x="${x(i)}" y="${H - pad.b + 18}" text-anchor="middle">${int(t)}</text>`)
    .join('');
  const series = configs
    .map((c, ci) => {
      const color = COLORS[ci % COLORS.length];
      const dots = c.runs
        .flatMap((r) =>
          r.rows.map((row, i) =>
            row.p99 == null ? '' : `<circle cx="${x(i) + (ci - 0.5) * 8}" cy="${y(row.p99)}" r="2.5" fill="${color}" opacity="0.35"/>`,
          ),
        )
        .join('');
      const line = c.steps.map((s, i) => `${x(i)},${y(s.p99.median)}`).join(' ');
      return `${dots}<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    })
    .join('');
  const legend = configs
    .map(
      (c, ci) =>
        `<span><i style="background:${COLORS[ci % COLORS.length]}"></i>${c.replicas} replica(s): median line, dots = individual runs</span>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="p99 latency per step">${grid}${xs}${series}
<text x="${pad.l}" y="${pad.t - 4}" class="axis">p99 ms (capped at ${maxY})</text>
<text x="${W - pad.r}" y="${H - 4}" text-anchor="end" class="axis">target req/s</text></svg>
<div class="legend">${legend}<span><i class="dash"></i>${pass.maxP99Ms} ms pass line</span></div>`;
}

const summaryRows = configs
  .map(
    (c) => `<tr><td>${c.replicas}</td><td>${c.runs.length}</td>
<td><b>${int(c.capacity)}${c.reachedTop ? '+' : ''}</b></td>
<td>${meanSd(c.runCapacity, int)}<small>median ${int(c.runCapacity.median)}, ${int(c.runCapacity.min)}–${int(c.runCapacity.max)}</small></td>
<td>${meanSd(c.peakAchieved, int)}<small>${int(c.peakAchieved.min)}–${int(c.peakAchieved.max)}</small></td>
<td>${meanSd(c.backlog, int)}<small>drained in ${meanSd(c.drain, one)} s</small></td>
<td>${int(c.dropped.mean)}</td>
<td class="${c.allVerified ? 'ok' : 'bad'}">${c.allVerified ? '✓ all' : '✗'}</td></tr>`,
  )
  .join('');

const stepHeader = configs.map((c) => `<th colspan="3">${c.replicas} replica(s)</th>`).join('');
const stepSub = configs.map(() => '<th>p99 mean ± sd</th><th>median</th><th>runs passed</th>').join('');
const stepRows = targets
  .map(
    (t, i) =>
      `<tr><td>${int(t)}</td>${configs
        .map((c) => {
          const s = c.steps[i];
          return `<td>${meanSd(s.p99, one)}</td><td class="${s.passed ? 'ok' : 'bad'}">${one(s.p99.median)}</td><td>${Math.round(s.passRate * c.runs.length)}/${c.runs.length}</td>`;
        })
        .join('')}</tr>`,
  )
  .join('');

const comparison = previous
  ? `<h2>Compared with the previous session</h2>
<p>Previous: <code>${esc(basename(previousDir))}</code> (${previous.reduce((a, c) => a + c.runs.length, 0)} runs). Means, with the change from previous to now.</p>
<table class="compare"><thead><tr><th>Replicas</th><th>Metric</th><th>Previous</th><th>Now</th><th>Change</th></tr></thead><tbody>
${configs
  .map((c) => {
    const p = previous.find((x) => x.replicas === c.replicas);
    if (!p) return '';
    const metric = (label, now, before, fmt) =>
      `<tr><td>${c.replicas}</td><td>${label}</td><td>${meanSd(before, fmt)} <small>n=${before?.n ?? 0}</small></td><td>${meanSd(now, fmt)} <small>n=${now?.n ?? 0}</small></td><td>${diff(now, before)}</td></tr>`;
    return [
      metric('Per-run capacity (req/s)', c.runCapacity, p.runCapacity, int),
      metric('Peak achieved (req/s)', c.peakAchieved, p.peakAchieved, int),
      ...targets.map((t, i) => metric(`p99 at ${int(t)} req/s (ms)`, c.steps[i].p99, p.steps[i]?.p99, one)),
    ].join('');
  })
  .join('')}
</tbody></table>`
  : '';

const runSections = configs
  .map(
    (c) =>
      `<h3>${c.replicas} API replica(s)</h3>${c.runs
        .map(
          (r, ri) => `<details><summary><b>Run ${ri + 1}</b> · capacity ${int(r.runCapacity)} req/s · peak ${int(r.peakAchieved)} req/s · ${int(r.purchases)} purchases · backlog ${int(r.backlog)} (drained ${one(r.drainSeconds)} s) · <span class="${r.verifyPassed ? 'ok' : 'bad'}">${r.verifyPassed ? 'verify ✓' : 'verify ✗'}</span></summary>
<table><thead><tr><th>Target req/s</th><th>Achieved</th><th>Purchase TPS</th><th>p50</th><th>p95</th><th>p99</th><th>Errors</th><th>Pass</th></tr></thead><tbody>
${r.rows
  .map(
    (x) =>
      `<tr><td>${int(x.target)}</td><td>${int(x.achievedRps)}</td><td>${int(x.purchaseTps)}</td><td>${one(x.p50)}</td><td>${one(x.p95)}</td><td>${one(x.p99)}</td><td>${(x.errorRate * 100).toFixed(2)}%</td><td class="${x.passed ? 'ok' : 'bad'}">${x.passed ? '✓' : '✗'}</td></tr>`,
  )
  .join('')}
</tbody></table>
<p class="meta">${esc(r.name)} · dropped iterations ${int(r.droppedIterations)} · ${r.hasReport ? `<a href="./${esc(r.name)}/report.html">k6 report (graphs over time)</a>` : 'no k6 report'}</p></details>`,
        )
        .join('')}`,
  )
  .join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Capacity comparison · ${esc(basename(dir))}</title>
<style>
:root{--text:#131a2c;--muted:#5f6b85;--border:#dfe5f2;--surface:#eef2fb;--ok:#12804a;--bad:#c0261b;--accent:#2759e0}
body{margin:0;font:15px/1.5 system-ui,-apple-system,sans-serif;color:var(--text);background:#fff}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px}
h1{margin:0 0 4px;font-size:1.6rem}h2{margin:36px 0 10px;font-size:1.2rem}h3{margin:24px 0 8px}
p{color:var(--muted);margin:6px 0}code{background:var(--surface);padding:1px 6px;border-radius:4px}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:8px 0;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--border);padding:7px 10px;text-align:right;white-space:nowrap}
th:first-child,td:first-child,.compare td:nth-child(2),.compare th:nth-child(2){text-align:left}th{background:var(--surface);font-weight:600;font-size:.85rem}
small{display:block;color:var(--muted);font-size:.78rem}
.ok{color:var(--ok)}.bad{color:var(--bad)}
details{border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin:8px 0}
summary{cursor:pointer}.meta{font-size:.85rem}
svg{width:100%;height:auto;font-size:12px;fill:var(--muted)}
svg .grid{stroke:var(--border)}svg .limit{stroke:var(--bad);stroke-dasharray:5 4}svg .axis{fill:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem;color:var(--muted)}
.legend i{display:inline-block;width:14px;height:3px;margin-right:6px;vertical-align:middle}
.legend i.dash{border-top:2px dashed var(--bad);height:0}
</style></head><body><main>
<h1>Capacity comparison</h1>
<p><code>${esc(basename(dir))}</code> · ${runs.length} runs in total · ${stepSeconds} s per step · steps ${targets.map(int).join(' → ')} req/s</p>
<p>A step passes when the achieved rate is ≥ ${pass.minAchieved * 100}% of target, p99 &lt; ${pass.maxP99Ms} ms and errors &lt; ${pass.maxErrorRate * 100}%. "Capacity" judges each step on the median across runs; "per-run capacity" judges each run on its own.</p>

<h2>Summary</h2>
<div class="table-wrap"><table><thead><tr><th>Replicas</th><th>Runs</th><th>Capacity (median rule)</th><th>Per-run capacity, mean ± sd</th><th>Peak achieved req/s</th><th>Persistence backlog at end</th><th>Dropped iterations (mean)</th><th>Verify</th></tr></thead>
<tbody>${summaryRows}</tbody></table></div>

<h2>p99 latency per step</h2>
${chart()}
<div class="table-wrap"><table><thead><tr><th rowspan="2">Target req/s</th>${stepHeader}</tr><tr>${stepSub}</tr></thead><tbody>${stepRows}</tbody></table></div>

${comparison}

<h2>Runs</h2>
<p>Click a run to see its steps. Each links to the k6 report of that run.</p>
${runSections}
</main></body></html>`;
writeFileSync(join(dir, 'compare.html'), html);

console.log(md);
console.log(`\nWrote ${join(dir, 'compare.md')} and compare.html`);
