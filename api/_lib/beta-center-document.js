import { betaStageLabel } from './beta-program-policy.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function card(experiment) {
  return `<article class="experiment-card">
    <div class="experiment-copy">
      <span class="stage">${escapeHtml(betaStageLabel(experiment.stage))}</span>
      <h2>${escapeHtml(experiment.displayName)}</h2>
      <p>${escapeHtml(experiment.description)}</p>
    </div>
    <a class="open-beta" href="${escapeHtml(experiment.route)}" data-experiment-id="${escapeHtml(experiment.id)}">Open Beta<span class="sr-only">: ${escapeHtml(experiment.displayName)}</span></a>
  </article>`;
}

export function renderBetaCenter(experiments = []) {
  const content = experiments.length
    ? `<div class="experiment-list" aria-label="Active beta experiments">${experiments.map(card).join('')}</div>`
    : '<div class="empty-state"><h2>Nothing to test right now</h2><p>No beta experiments are active right now. Check back soon.</p></div>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>CAISSA Beta Program</title>
<style>
:root{color-scheme:dark;--navy:#041a2a;--panel:#08283e;--line:#24506b;--gold:#f0b45a;--blue:#49a4ff;--text:#f7fbff;--muted:#b7c9d6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,#0b3550 0,#031522 52%,#020d16 100%);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.shell{width:min(920px,calc(100% - 32px));margin:auto;padding:32px 0 64px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:40px}.brand{color:var(--text);text-decoration:none;font-weight:800;letter-spacing:.18em}.account-link{color:var(--muted);text-underline-offset:4px}main>p{color:var(--muted);max-width:58ch;margin-top:-8px;margin-bottom:28px}h1{font-size:clamp(2rem,8vw,3.4rem);line-height:1.05;margin:.2em 0}.experiment-list{display:grid;gap:16px}.experiment-card,.empty-state{border:1px solid var(--line);background:linear-gradient(145deg,rgba(10,48,72,.96),rgba(4,25,40,.98));border-radius:18px;padding:24px;box-shadow:0 18px 50px #0005}.experiment-card{display:flex;align-items:center;justify-content:space-between;gap:24px}.experiment-card h2,.empty-state h2{margin:.3rem 0;font-size:1.35rem}.experiment-card p,.empty-state p{color:var(--muted);margin:.35rem 0}.stage{display:inline-flex;color:#07131c;background:var(--gold);border-radius:999px;padding:.28rem .7rem;font-size:.78rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.open-beta{display:inline-flex;justify-content:center;min-width:128px;border-radius:12px;padding:.8rem 1rem;background:var(--blue);color:#02111c;text-decoration:none;font-weight:800}.open-beta:focus-visible,.brand:focus-visible,.account-link:focus-visible{outline:3px solid #fff;outline-offset:4px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:600px){.shell{width:min(100% - 24px,920px);padding-top:20px}header{margin-bottom:32px}.experiment-card{align-items:stretch;flex-direction:column}.open-beta{width:100%}}
</style></head><body><div class="shell"><header><a class="brand" href="/">CAISSA CHESS</a><a class="account-link" href="/">Back to CAISSA</a></header><main><h1>CAISSA Beta</h1><p>Test upcoming CAISSA features before release. Your feedback helps shape what comes next.</p>${content}</main></div></body></html>`;
}

export function renderBetaDenied() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Beta access unavailable</title></head><body><main><h1>Beta access unavailable</h1><p>This account does not currently have access to the CAISSA Beta Program.</p><p><a href="/">Return to CAISSA</a></p></main></body></html>';
}
