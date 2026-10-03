document.getElementById('run').addEventListener('click', async () => {
    const button = document.getElementById('run'), status = document.getElementById('status'), result = document.getElementById('result');
    button.disabled = true; status.textContent = 'Running';
    try {
        const pgn = '[Event "Synthetic acceptance"]\n[White "Alex"]\n[Black "Fixture"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 0-1';
        const dataset = CaissaInsightsCore.parse(pgn, { provider: 'local', username: 'Alex' }, Chess);
        const report = await CaissaInsightsAnalysis.generate(dataset, 1, 'both', { Chess,
            onProgress: (_percent, text) => { status.textContent = text; } });
        const passed = report.analysisStatus === 'complete' && report.aggregate.coverage.evaluated === 2
            && report.aggregate.wld.losses === 1 && report.aggregate.wld.wins === 0
            && report.searchedPositions === 5 && report.engine?.identityValidated === true
            && report.analyses[0].evaluations.every(e => e.status === 'complete' && e.depth >= 12);
        result.textContent = JSON.stringify({ passed, coverage: report.aggregate.coverage, wld: report.aggregate.wld,
            searchedPositions: report.searchedPositions, analysisStatus: report.analysisStatus, engine: report.engine,
            elapsedMs: report.elapsedMs, evaluations: report.analyses[0].evaluations }, null, 2);
        status.textContent = passed ? 'PASS' : 'FAIL';
    } catch (error) { status.textContent = 'FAIL'; result.textContent = JSON.stringify({ error: error.message }); }
    finally { button.disabled = false; }
});
