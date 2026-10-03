// Preview-only, synthetic browser acceptance check. Never accesses account data.
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (process.env.VERCEL_ENV !== 'preview') return res.status(404).end();
    if (req.method !== 'GET') return res.status(405).end();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
