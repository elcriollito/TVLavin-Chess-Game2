(function installCoachMoveReview(root) {
    'use strict';

    const SCHEMA_VERSION = '1.2.0';
    const COLORS = Object.freeze(['white', 'black']);
    const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    const MAX_TEXT = 32;

    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const clean = value => typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
    const playerValue = (score, color) => color === 'white' ? score : -score;
    const mateValue = (mate, color) => {
        if (!finite(mate) || mate === 0) return null;
        const whiteValue = mate > 0 ? 100 : -100;
        return color === 'white' ? whiteValue : -whiteValue;
    };
    const positionValue = (score, mate, color) => mateValue(mate, color)
        ?? (finite(score) ? playerValue(score, color) : null);
    const annotation = (key, symbol, label) => freeze({ key, symbol, label });
    const ANNOTATIONS = freeze({
        book: annotation('book', '📖', 'Book move'),
        best: annotation('best', '★', 'Best move'),
        precise: annotation('precise', '!', 'Precise move'),
        good: annotation('good', '✓', 'Good move'),
        inaccuracy: annotation('inaccuracy', '?!', 'Imprecise move'),
        mistake: annotation('mistake', '?', 'Mistake'),
        blunder: annotation('blunder', '??', 'Blunder')
    });

    function createReview(input = {}) {
        const playedUci = clean(input.playedUci).toLowerCase();
        const bestUci = clean(input.bestUci).toLowerCase();
        const playedSan = clean(input.playedSan);
        const bestSan = clean(input.bestSan);
        const playerColor = input.playerColor;
        if (!COLORS.includes(playerColor) || !UCI.test(playedUci) || !playedSan)
            return freeze({ ok: false, reasonCode: 'INVALID_REVIEW' });

        if (input.bookMove === true) return freeze({
            ok: true, reasonCode: 'BOOK_MOVE', quality: 'book', loss: 0,
            annotation: ANNOTATIONS.book,
            message: `${playedSan} follows known opening theory.`
        });

        if (!UCI.test(bestUci) || !bestSan)
            return freeze({ ok: false, reasonCode: 'INVALID_REVIEW' });

        if (playedUci === bestUci) return freeze({
            ok: true, reasonCode: 'BEST_MOVE', quality: 'best', loss: 0,
            annotation: ANNOTATIONS.best,
            message: `Excellent: ${playedSan} matches my favorite move in this position.`
        });

        const before = positionValue(input.beforeScore, input.beforeMate, playerColor);
        const after = positionValue(input.afterScore, input.afterMate, playerColor);
        const loss = finite(before) && finite(after) ? Math.max(0, before - after) : null;
        if (loss === null) return freeze({
            ok: true, reasonCode: 'PREFERRED_MOVE', quality: 'unscored', loss: null,
            annotation: null,
            message: `You played ${playedSan}. I preferred ${bestSan}; compare what that move improves.`
        });
        const openingPly = Number.isInteger(input.ply) && input.ply >= 1 && input.ply <= 12;
        const thresholds = openingPly
            ? { precise: 0.2, good: 0.65, inaccuracy: 1.15, mistake: 2.25 }
            : { precise: 0.1, good: 0.45, inaccuracy: 1.0, mistake: 2.0 };
        if (loss < thresholds.precise) return freeze({
            ok: true, reasonCode: 'PRECISE_MOVE', quality: 'precise', loss,
            annotation: ANNOTATIONS.precise,
            message: `${playedSan} is precise. My first choice was ${bestSan}.`
        });
        if (loss < thresholds.good) return freeze({
            ok: true, reasonCode: 'STRONG_ALTERNATIVE', quality: 'good', loss,
            annotation: ANNOTATIONS.good,
            message: `${playedSan} is playable, although I slightly preferred ${bestSan}.`
        });
        if (loss < thresholds.inaccuracy) return freeze({
            ok: true, reasonCode: 'MORE_PRECISE_MOVE', quality: 'inaccuracy', loss,
            annotation: ANNOTATIONS.inaccuracy,
            message: `You played ${playedSan}. I preferred ${bestSan} as a more precise choice.`
        });
        if (loss < thresholds.mistake) return freeze({
            ok: true, reasonCode: 'BETTER_MOVE', quality: 'mistake', loss,
            annotation: ANNOTATIONS.mistake,
            message: `You played ${playedSan}. I would have chosen ${bestSan}; it would have kept your position stronger.`
        });
        return freeze({
            ok: true, reasonCode: 'BLUNDER', quality: 'blunder', loss,
            annotation: ANNOTATIONS.blunder,
            message: `You played ${playedSan}. I would have chosen ${bestSan}; that alternative avoided a serious setback.`
        });
    }

    root.CaissaCoachMoveReview = freeze({
        schemaVersion: SCHEMA_VERSION,
        annotations: ANNOTATIONS,
        createReview
    });
})(typeof window !== 'undefined' ? window : globalThis);
