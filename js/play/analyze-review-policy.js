(function installAnalyzeReviewPolicy(root) {
    'use strict';
    const VERSION = '1.0.0';
    const freeze = value => Object.freeze(value);
    const thresholds = freeze({ inaccuracyMinimum: 0.5, mistakeMinimum: 1, blunderMinimum: 2.5 });
    const presentationSymbols = freeze({ Book: '📖', Best: '★', Precise: '!', Good: '✓', Acceptable: '✓',
        Inaccuracy: '?!', Mistake: '?', Blunder: '??' });
    const presentationSymbol = quality => presentationSymbols[quality] || '';
    function classify(input = {}) {
        const loss = input.loss;
        if (typeof loss !== 'number' || !Number.isFinite(loss) || loss < 0)
            return freeze({ ok: false, reasonCode: 'EVIDENCE_MISSING' });
        if (input.mateSwing === true || loss >= thresholds.blunderMinimum)
            return freeze({ ok: true, quality: 'Blunder', annotation: '??', visibleAnnotation: true });
        if (loss >= thresholds.mistakeMinimum)
            return freeze({ ok: true, quality: 'Mistake', annotation: '?', visibleAnnotation: true });
        if (loss >= thresholds.inaccuracyMinimum)
            return freeze({ ok: true, quality: 'Inaccuracy', annotation: '?!', visibleAnnotation: true });
        if (input.book === true)
            return freeze({ ok: true, quality: 'Book', annotation: '', visibleAnnotation: false, accuracyIncluded: false });
        return freeze({ ok: true, quality: 'Acceptable', annotation: '', visibleAnnotation: false, accuracyIncluded: true });
    }
    function accuracy(results) {
        if (!Array.isArray(results) || results.length === 0
            || results.some(item => !Number.isFinite(item?.loss) || item.loss < 0))
            return freeze({ ok: false, reasonCode: 'EVIDENCE_INSUFFICIENT', value: null });
        const included = results.filter(item => item.accuracyIncluded !== false);
        if (!included.length) return freeze({ ok: false, reasonCode: 'NO_SCORED_MOVES', value: null });
        const total = included.reduce((sum, item) => sum + 100 * Math.exp(-0.55 * item.loss), 0);
        return freeze({ ok: true, reasonCode: 'ACCURACY_CALCULATED', value: (total / included.length).toFixed(1) });
    }
    function critical(input = {}) {
        const classified = classify(input);
        return classified.ok && (classified.quality === 'Mistake' || classified.quality === 'Blunder'
            || input.mateSwing === true || input.beforePlayerEval >= 1.5 && input.afterPlayerEval < 0.5);
    }
    root.CaissaAnalyzeReviewPolicy = freeze({ schemaVersion: VERSION, contractId: `AnalyzeReviewPolicy@${VERSION}`,
        classifications: freeze(['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder']), presentationSymbols,
        presentationSymbol, thresholds, classify, accuracy, critical });
})(typeof window !== 'undefined' ? window : globalThis);
