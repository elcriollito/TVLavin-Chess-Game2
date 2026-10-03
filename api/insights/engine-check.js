import { readFileSync } from 'node:fs';

// Preview-only, synthetic browser acceptance check. Never accesses account data.
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (process.env.VERCEL_ENV !== 'preview') return res.status(404).end();
    if (req.method !== 'GET') return res.status(405).end();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.query?.report === '1') {
        const source = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
        const start = source.indexOf('<section id="insightsSection"'), end = source.indexOf('<details id="insightHistory"', start);
        const shell = source.slice(start, end).replace('class="content-section"', 'class="content-section active"');
        return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CAISSA report acceptance — synthetic games</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/insights-account.css?v=2.0.0"><style>body{overflow:auto;height:auto;background:#0d1a26;color:#edf5fc;margin:0}.ir-fixture-label{padding:10px 20px;text-align:center;background:#493b26;color:#fff0c5}#insightsSection{display:block}#result{white-space:pre-wrap;padding:20px;overflow-wrap:anywhere}#insightViewHistoryBtn{display:none}</style></head><body><p class="ir-fixture-label">Technical acceptance · synthetic PGN games · real Stockfish review · no account data</p>${shell}</div></section><p id="status" role="status">Ready — use Generate report</p><details><summary>Technical result</summary><pre id="result"></pre></details><script src="/assets/vendor/chess.js/chess-0.10.3.min.js"></script><script src="/js/engine-adapter.js"></script><script src="/js/engine-registry.js"></script><script src="/js/play/analyze-handoff.js"></script><script src="/js/insights/core.js"></script><script src="/js/insights/engine-analysis.js"></script><script src="/js/insights/report-model.js"></script><script src="/js/insights/report-view.js"></script><script src="/js/insights/report-check.js"></script></body></html>`);
    }
    return res.status(200).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Insights engine acceptance fixture</title></head>
<body>
<h1>Insights engine acceptance fixture</h1>
<p>Synthetic PGN only. This check uses the published review engine and does not access accounts, credits or saved reports.</p>
<button id="run" type="button">Run engine smoke test</button>
<p id="status" role="status">Ready</p><pre id="result"></pre>
<script src="/assets/vendor/chess.js/chess-0.10.3.min.js"></script>
<script src="/js/engine-adapter.js"></script><script src="/js/engine-registry.js"></script>
<script src="/js/insights/core.js"></script><script src="/js/insights/engine-analysis.js"></script>
<script src="/js/insights/engine-check.js"></script>
</body></html>`);
}
