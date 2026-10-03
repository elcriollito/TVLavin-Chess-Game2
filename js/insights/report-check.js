// Synthetic acceptance data for the Preview-only engine-check route.
// This script has no authentication, credit or persistence dependency.
(function reportAcceptance(global) {
    'use strict';
    const opening = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 g6 15. a4 c5 16. d5 c4 17. Bg5 h6 18. Be3 Bg7 19. Qd2 Kh7 20. Nh2';
    const fixtures = Array.from({ length: 7 }, (_, i) => ({ white: i % 2 ? 'Fixture' : 'QA Player', black: i % 2 ? 'QA Player' : 'Fixture', result: i % 3 ? '1-0' : '0-1',
        extra: '[Opening "Ruy Lopez"]\n[ECO "C90"]\n[Termination "Game won by resignation"]', moves: opening }));
    fixtures.push({ white: 'QA Player', black: 'Fixture', result: '0-1', extra: '[Opening "King’s Pawn"]', moves: '1. f3 e5 2. g4 Qh4#' });
    fixtures.push({ white: 'QA Player', black: 'Fixture', result: '1-0', extra: '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/R5K1 w - - 0 40"]\n[Termination "Fixture resigned"]', moves: '40. Ra8+ Kh7 41. Ra7+ Kg6 42. Ra6+ Kf5 43. Ra5+ Ke4 44. Ra4+ Kd3 45. Ra3+ Kc2 46. Ra2+ Kb1' });
    fixtures.push({ white: 'QA Player', black: 'Fixture', result: '1/2-1/2', extra: '[SetUp "1"]\n[FEN "r7/8/8/8/8/1k6/8/7K w - - 0 30"]\n[Termination "Threefold repetition"]', moves: '30. Kh2 Ra2+ 31. Kg1 Ra1+ 32. Kh2 Ra2+ 33. Kg1 Ra1+ 34. Kh2 Ra2+ 35. Kg1' });
    const pgn = fixtures.map((f, i) => `[Event "Synthetic report acceptance"]\n[White "${f.white}"]\n[Black "${f.black}"]\n[Result "${f.result}"]\n[Date "2026.09.${String(i + 1).padStart(2, '0')}"]\n[WhiteElo "${1250 + i * 7}"]\n[BlackElo "${1300 + i * 5}"]\n[TimeControl "${i % 2 ? '600+5' : '180+2'}"]\n${f.extra}\n\n${f.moves} ${f.result}`).join('\n\n');
    const dataset = global.CaissaInsightsCore.parse(pgn, { provider: 'local', username: 'QA Player' }, global.Chess);
    const root = document.getElementById('insightDashboard'), status = document.getElementById('status'), result = document.getElementById('result');
    let report = null;
    function mount() {
        return global.CaissaInsightReportView.mount(root, dataset, report, { onReview(moment) {
            const handoff = global.CaissaInsightReportView.createHandoff(moment);
            if (handoff.ok) global.location.assign(`/analyze?handoff=${encodeURIComponent(handoff.token)}`);
        }, onAction(action) {
            if (action === 'export') {
                const url = URL.createObjectURL(new Blob([JSON.stringify({ dataset, report }, null, 2)], { type: 'application/json' }));
                const link = document.createElement('a'); link.href = url; link.download = 'caissa-synthetic-report-acceptance.json'; link.click(); URL.revokeObjectURL(url);
            }
        } });
    }
    document.getElementById('insightLatestIdentity').textContent = `${dataset.subject.username} · ${dataset.games.length} synthetic games`;
    document.getElementById('insightLatestStatus').textContent = 'Technical fixture — not saved to an account.';
    mount();
    document.getElementById('openInsightModal').addEventListener('click', async event => {
        const button = event.currentTarget, progress = document.getElementById('insightRunProgress');
        button.disabled = true; progress.hidden = false;
        try {
            report = await global.CaissaInsightsAnalysis.generate(dataset, 10, 'both', { previousReport: report, previousDataset: dataset,
                onProgress(_percent, text) { status.textContent = text; progress.textContent = text; } });
            const model = mount();
            const passed = dataset.games.length === 10 && report.analysisStatus === 'complete'
                && model.review.reviewed === model.review.eligible && model.review.axes.every(axis => axis.value !== null)
                && model.results.total === 10 && report.engine?.identityValidated === true;
            status.textContent = passed ? 'PASS — ten-game real engine review and report' : 'PARTIAL — see technical result';
            document.getElementById('insightPrimaryLabel').textContent = passed ? 'Review complete' : 'Continue report';
            document.getElementById('insightLatestStatus').textContent = `Synthetic engine review: ${report.aggregate.coverage.evaluated}/${report.aggregate.coverage.eligible} own moves · ${report.analysisStatus}. Not saved to an account.`;
            result.textContent = JSON.stringify({ passed, games: dataset.games.length, rejected: dataset.rejected, coverage: report.aggregate.coverage,
                wld: report.aggregate.wld, axes: model.review.axes.map(({ name, value, count }) => ({ name, value, count })), searchedPositions: report.searchedPositions,
                elapsedMs: report.elapsedMs, engine: report.engine, report, dataset }, null, 2);
        } catch (error) { status.textContent = 'FAIL'; result.textContent = JSON.stringify({ error: error.message }); }
        finally { button.disabled = false; progress.hidden = true; }
    });
})(window);
