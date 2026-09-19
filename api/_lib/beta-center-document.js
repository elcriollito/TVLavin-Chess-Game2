import { betaStageLabel } from './beta-program-policy.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function card(experiment, activitySummaries) {
  const summary = activitySummaries?.[experiment.id];
  const progress = summary
    ? `<p class="card-progress"><strong>${escapeHtml(summary.completed)} / ${escapeHtml(summary.target)}</strong> submitted</p>`
    : '';
  return `<article class="experiment-card">
    <div class="experiment-copy">
      <span class="stage">${escapeHtml(betaStageLabel(experiment.stage))}</span>
      <h2>${escapeHtml(experiment.displayName)}</h2>
      <p>${escapeHtml(experiment.description)}</p>
      ${progress}
    </div>
    <a class="open-beta" href="${escapeHtml(experiment.route)}" data-experiment-id="${escapeHtml(experiment.id)}">Open Beta<span class="sr-only">: ${escapeHtml(experiment.displayName)}</span></a>
  </article>`;
}

function activityPanel(summary) {
  if (!summary) return '';
  const metrics = [
    ['Scans attempted', summary.attempted],
    ['Completed submissions', summary.completed],
    ['Confirmed correct', summary.confirmedCorrect],
    ['Corrected', summary.corrected],
    ['Localization failures', summary.localizationFailures],
    ['Scan failures', summary.scanFailures],
    ['Pending / incomplete', summary.pending]
  ];
  const empty = summary.completed === 0 ? '<p class="activity-empty">No beta submissions yet.</p>' : '';
  const milestone = summary.milestone
    ? `<p class="milestone"><span aria-hidden="true">&#10003;</span> ${escapeHtml(summary.milestone.label)}</p>`
    : '';
  return `<section class="activity-card" aria-labelledby="beta-activity-title">
    <div class="activity-heading"><div><span class="eyebrow">Scanner Beta</span><h2 id="beta-activity-title">Your Beta Activity</h2></div>
      <strong class="activity-total">${escapeHtml(summary.completed)} / ${escapeHtml(summary.target)}<span>completed scans</span></strong></div>
    <div class="progress-copy"><span>Progress toward field-test target</span><span>${escapeHtml(summary.completed)} of ${escapeHtml(summary.target)}</span></div>
    <progress value="${escapeHtml(Math.min(summary.completed, summary.target))}" max="${escapeHtml(summary.target)}" aria-label="${escapeHtml(summary.completed)} of ${escapeHtml(summary.target)} completed scans"></progress>
    ${empty}${milestone}
    <dl class="activity-grid">${metrics.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    <div class="time-counts" aria-label="Completed submission time totals"><span>Today <strong>${escapeHtml(summary.completedToday)}</strong></span><span>This week <strong>${escapeHtml(summary.completedThisWeek)}</strong></span><span>All-time beta <strong>${escapeHtml(summary.completedAllTime)}</strong></span></div>
  </section>`;
}

export function renderBetaCenter(experiments = [], activitySummaries = {}) {
  const scannerActivity = activityPanel(activitySummaries?.scanner);
  const content = experiments.length
    ? `<div class="experiment-list" aria-label="Active beta experiments">${experiments.map(experiment => card(experiment, activitySummaries)).join('')}</div>`
    : '<div class="empty-state"><h2>Nothing to test right now</h2><p>No beta experiments are active right now. Check back soon.</p></div>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>CAISSA Beta Program</title>
<style>
:root{color-scheme:dark;--navy:#041a2a;--panel:#08283e;--line:#24506b;--gold:#f0b45a;--blue:#49a4ff;--text:#f7fbff;--muted:#b7c9d6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#0b3550 0,#031522 52%,#020d16 100%);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.shell{width:min(920px,calc(100% - 32px));margin:auto;padding:32px 0 64px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:40px}.brand{color:var(--text);text-decoration:none;font-weight:800;letter-spacing:.18em}.account-link{color:var(--muted);text-underline-offset:4px}main>p{color:var(--muted);max-width:58ch;margin-top:-8px;margin-bottom:28px}h1{font-size:clamp(2rem,8vw,3.4rem);line-height:1.05;margin:.2em 0}.activity-card,.experiment-card,.empty-state{border:1px solid var(--line);background:linear-gradient(145deg,rgba(10,48,72,.96),rgba(4,25,40,.98));border-radius:18px;padding:24px;box-shadow:0 18px 50px #0005}.activity-card{margin-bottom:24px}.activity-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.activity-heading h2{margin:.15rem 0 1rem;font-size:1.55rem}.eyebrow{color:var(--gold);font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.activity-total{font-size:1.6rem;text-align:right;white-space:nowrap}.activity-total span{display:block;color:var(--muted);font-size:.78rem;font-weight:600}.progress-copy{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:.8rem}progress{display:block;width:100%;height:12px;margin:.45rem 0 1rem;border:0;border-radius:999px;overflow:hidden;background:#031522}progress::-webkit-progress-bar{background:#031522}progress::-webkit-progress-value{background:linear-gradient(90deg,var(--blue),var(--gold))}progress::-moz-progress-bar{background:linear-gradient(90deg,var(--blue),var(--gold))}.activity-empty{color:var(--muted);margin:.6rem 0}.milestone{color:var(--gold);font-weight:750;margin:.6rem 0}.activity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin:1rem 0 0;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}.activity-grid div{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#061f31;padding:.7rem .8rem}.activity-grid dt{color:var(--muted);font-size:.86rem}.activity-grid dd{margin:0;font-size:1.05rem;font-weight:800}.time-counts{display:flex;flex-wrap:wrap;gap:.55rem 1.2rem;margin-top:1rem;color:var(--muted);font-size:.82rem}.time-counts strong{color:var(--text);margin-left:.25rem}.experiment-list{display:grid;gap:16px}.experiment-card{display:flex;align-items:center;justify-content:space-between;gap:24px}.experiment-card h2,.empty-state h2{margin:.3rem 0;font-size:1.35rem}.experiment-card p,.empty-state p{color:var(--muted);margin:.35rem 0}.experiment-card .card-progress{color:var(--text);margin-top:.7rem}.card-progress strong{color:var(--gold)}.stage{display:inline-flex;color:#07131c;background:var(--gold);border-radius:999px;padding:.28rem .7rem;font-size:.78rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.open-beta{display:inline-flex;justify-content:center;min-width:128px;border-radius:12px;padding:.8rem 1rem;background:var(--blue);color:#02111c;text-decoration:none;font-weight:800}.open-beta:focus-visible,.brand:focus-visible,.account-link:focus-visible{outline:3px solid #fff;outline-offset:4px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:600px){.shell{width:min(100% - 24px,920px);padding-top:20px}header{margin-bottom:32px}.activity-card{padding:18px}.activity-heading{align-items:flex-end}.activity-total{font-size:1.35rem}.activity-grid{grid-template-columns:1fr}.experiment-card{align-items:stretch;flex-direction:column}.open-beta{width:100%}}
</style></head><body><div class="shell"><header><a class="brand" href="/">CAISSA CHESS</a><a class="account-link" href="/">Back to CAISSA</a></header><main><h1>CAISSA Beta</h1><p>Test upcoming CAISSA features before release. Your feedback helps shape what comes next.</p>${scannerActivity}${content}</main></div></body></html>`;
}

export function renderBetaDenied() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Beta access unavailable</title></head><body><main><h1>Beta access unavailable</h1><p>This account does not currently have access to the CAISSA Beta Program.</p><p><a href="/">Return to CAISSA</a></p></main></body></html>';
}
