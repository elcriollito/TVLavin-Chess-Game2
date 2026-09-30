(function installAnalyzeVariationTree(root) {
    'use strict';

    const VERSION = '1.0.0';
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (root.CaissaAnalyzeVariationTree?.VERSION === VERSION) return;

    const cloneMove = move => Object.freeze({ ...(move || {}) });
    const cloneNode = node => Object.freeze({
        ...node,
        move: cloneMove(node.move),
        comments: Object.freeze([...(node.comments || [])]),
        nags: Object.freeze([...(node.nags || [])]),
        childrenIds: Object.freeze([...node.childrenIds]),
        variationIds: Object.freeze(node.childrenIds.filter(id => id !== node.mainChildId))
    });

    function create(options = {}) {
        const {
            handoffId = null, recordId = null, initialFen = null,
            originalMoves = [], parsedGame = null, originalPgn = '', originalResult = '*',
            selectedPly = parsedGame?.mainline?.length ?? originalMoves.length
        } = options;
        const nodes = new Map();
        const selectedChildren = new Map();
        const originalLineIds = [];
        let sequence = 0;
        let localSequence = 0;
        let active = true;

        nodes.set('root', {
            id: 'root', parentId: null, san: null, uci: null, move: {},
            fen: initialFen || parsedGame?.startFen || START_FEN, fenBefore: null, ply: 0,
            moveNumber: 0, color: null, source: 'root', comments: [], nags: [],
            childrenIds: [], mainChildId: null
        });

        function appendNode(parent, raw = {}, { main = false, source = 'original' } = {}) {
            const move = raw.move && typeof raw.move === 'object' ? raw.move : raw;
            const id = raw.id && !nodes.has(raw.id) ? String(raw.id) : `${source}-${++sequence}`;
            const san = String(raw.san || move.san || '');
            const node = {
                id,
                parentId: parent.id,
                san,
                uci: String(raw.uci || `${raw.from || move.from || ''}${raw.to || move.to || ''}${raw.promotion || move.promotion || ''}`),
                move: { ...move, san },
                fen: raw.fen || raw.fenAfter || parent.fen || null,
                fenBefore: raw.fenBefore || parent.fen || null,
                ply: parent.ply + 1,
                moveNumber: Number.isSafeInteger(raw.moveNumber)
                    ? raw.moveNumber
                    : Math.floor(parent.ply / 2) + 1,
                color: raw.color || raw.turn || (parent.ply % 2 === 0 ? 'w' : 'b'),
                source,
                comments: [...(raw.comments || [])],
                nags: [...(raw.nags || [])],
                childrenIds: [],
                mainChildId: null
            };
            nodes.set(id, node);
            parent.childrenIds.push(id);
            if (main || !parent.mainChildId) parent.mainChildId = id;
            return node;
        }

        function importParsedLine(line, parentId, { main = false, topLevel = false } = {}) {
            let parent = nodes.get(parentId);
            (line || []).forEach((raw, index) => {
                const node = appendNode(parent, raw, { main: main || index > 0, source: 'original' });
                if (topLevel) originalLineIds.push(node.id);
                (raw.variations || []).forEach(variation => {
                    importParsedLine(variation, parent.id, { main: false, topLevel: false });
                });
                parent = node;
            });
        }

        if (parsedGame?.mainline) {
            importParsedLine(parsedGame.mainline, 'root', { main: true, topLevel: true });
        } else {
            let parent = nodes.get('root');
            originalMoves.forEach(raw => {
                const node = appendNode(parent, raw, { main: true, source: 'original' });
                originalLineIds.push(node.id);
                parent = node;
            });
        }

        nodes.forEach(node => {
            if (node.mainChildId) selectedChildren.set(node.id, node.mainChildId);
        });
        const boundedPly = Math.max(0, Math.min(
            Number.isSafeInteger(selectedPly) ? selectedPly : originalLineIds.length,
            originalLineIds.length
        ));
        let currentNodeId = boundedPly === 0 ? 'root' : originalLineIds[boundedPly - 1];

        function pathTo(nodeId) {
            const reverse = [];
            let node = nodes.get(nodeId);
            while (node && node.id !== 'root') {
                reverse.push(node.id);
                node = nodes.get(node.parentId);
            }
            return reverse.reverse();
        }

        function activeLineIds() {
            const ids = [];
            let node = nodes.get('root');
            const visited = new Set(['root']);
            while (node) {
                const nextId = selectedChildren.get(node.id) || node.mainChildId;
                if (!nextId || visited.has(nextId) || !nodes.has(nextId)) break;
                visited.add(nextId);
                ids.push(nextId);
                node = nodes.get(nextId);
            }
            return ids;
        }

        function selectNode(nodeId, { preferMainContinuation = true } = {}) {
            if (!active || !nodes.has(nodeId)) {
                return Object.freeze({ ok: false, status: active ? 'not-found' : 'disposed' });
            }
            const path = pathTo(nodeId);
            let parentId = 'root';
            path.forEach(id => {
                selectedChildren.set(parentId, id);
                parentId = id;
            });
            const node = nodes.get(nodeId);
            if (preferMainContinuation && node.mainChildId) {
                selectedChildren.set(node.id, node.mainChildId);
            }
            currentNodeId = nodeId;
            return Object.freeze({ ok: true, status: 'selected', node: cloneNode(node) });
        }

        function nodeMatchesMove(node, move) {
            const uci = String(move.uci || `${move.from || ''}${move.to || ''}${move.promotion || ''}`);
            if (uci && node.uci) return node.uci === uci;
            return node.san === String(move.san || '');
        }

        function inspect() {
            return Object.freeze({
                schemaVersion: `CaissaAnalyzeVariationTree@${VERSION}`,
                active, handoffId, recordId,
                initialFen: initialFen || parsedGame?.startFen || null,
                originalPgn, originalResult,
                originalLineIds: Object.freeze([...originalLineIds]),
                currentNodeId,
                currentFen: nodes.get(currentNodeId)?.fen || initialFen || parsedGame?.startFen || START_FEN,
                activeLineIds: Object.freeze(activeLineIds()),
                nodes: Object.freeze([...nodes.values()].map(cloneNode)),
                localNodeCount: [...nodes.values()].filter(node => node.source === 'local').length,
                networkPolicy: 'local-only'
            });
        }

        function escapeHeader(value) {
            return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        }

        function moveToken(node, first) {
            const prefix = node.color === 'w'
                ? `${node.moveNumber}. `
                : first ? `${node.moveNumber}... ` : '';
            const nags = node.nags.length ? ` ${node.nags.join(' ')}` : '';
            const comments = node.comments
                .map(comment => ` {${String(comment).replace(/[{}]/g, '').trim()}}`)
                .join('');
            return `${prefix}${node.san}${nags}${comments}`.trim();
        }

        function renderSequence(startId, suppressStartSiblings = false) {
            const tokens = [];
            let node = nodes.get(startId);
            let first = true;
            const visited = new Set();
            while (node && !visited.has(node.id)) {
                visited.add(node.id);
                tokens.push(moveToken(node, first));
                const parent = nodes.get(node.parentId);
                if (!(first && suppressStartSiblings)) {
                    (parent?.childrenIds || [])
                        .filter(id => id !== node.id)
                        .forEach(id => tokens.push(`(${renderSequence(id, true)})`));
                }
                node = node.mainChildId ? nodes.get(node.mainChildId) : null;
                first = false;
            }
            return tokens.join(' ');
        }

        function serialize({ headers = {}, result = originalResult || '*' } = {}) {
            const normalizedHeaders = { ...headers, Result: result || headers.Result || '*' };
            const headerText = Object.entries(normalizedHeaders)
                .filter(([name, value]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && value != null)
                .map(([name, value]) => `[${name} "${escapeHeader(value)}"]`)
                .join('\n');
            const firstId = nodes.get('root').mainChildId;
            const moveText = firstId ? renderSequence(firstId) : '';
            const resultToken = normalizedHeaders.Result || '*';
            return `${headerText}${headerText ? '\n\n' : ''}${moveText}${moveText ? ' ' : ''}${resultToken}`.trim();
        }

        return Object.freeze({
            schemaVersion: `CaissaAnalyzeVariationTree@${VERSION}`,
            inspect,
            getNode(nodeId) {
                const node = nodes.get(nodeId);
                return node ? cloneNode(node) : null;
            },
            getCurrentNode() { return cloneNode(nodes.get(currentNodeId)); },
            getActiveLine() { return activeLineIds().map(id => cloneNode(nodes.get(id))); },
            getMainLine() {
                const line = [];
                let node = nodes.get(nodes.get('root').mainChildId);
                while (node) {
                    line.push(cloneNode(node));
                    node = node.mainChildId ? nodes.get(node.mainChildId) : null;
                }
                return line;
            },
            selectNode,
            insertOrSelectMove(move = {}) {
                if (!active) return Object.freeze({ ok: false, status: 'disposed' });
                const parent = nodes.get(currentNodeId);
                if (!parent) return Object.freeze({ ok: false, status: 'parent-not-found' });
                const existingId = parent.childrenIds.find(id => nodeMatchesMove(nodes.get(id), move));
                if (existingId) {
                    selectNode(existingId, { preferMainContinuation: true });
                    return Object.freeze({
                        ok: true, status: 'existing-selected', created: false,
                        node: cloneNode(nodes.get(existingId))
                    });
                }
                const id = `local-${++localSequence}`;
                const node = appendNode(parent, { ...move, id }, {
                    main: !parent.mainChildId,
                    source: 'local'
                });
                selectedChildren.set(parent.id, node.id);
                currentNodeId = node.id;
                return Object.freeze({
                    ok: true,
                    status: parent.mainChildId === node.id ? 'mainline-extended' : 'variation-created',
                    created: true,
                    node: cloneNode(node)
                });
            },
            previous() {
                const node = nodes.get(currentNodeId);
                return selectNode(node?.parentId || 'root', { preferMainContinuation: false });
            },
            next() {
                const node = nodes.get(currentNodeId);
                const nextId = selectedChildren.get(currentNodeId) || node?.mainChildId;
                return nextId ? selectNode(nextId, { preferMainContinuation: false })
                    : Object.freeze({ ok: false, status: 'end' });
            },
            first() { return selectNode('root', { preferMainContinuation: false }); },
            last() {
                const line = activeLineIds();
                return selectNode(line.at(-1) || 'root', { preferMainContinuation: false });
            },
            resetVariations() {
                if (!active) return Object.freeze({ ok: false, status: 'disposed' });
                [...nodes.values()].filter(node => node.source === 'local').forEach(node => nodes.delete(node.id));
                nodes.forEach(node => {
                    node.childrenIds = node.childrenIds.filter(id => nodes.has(id));
                    if (node.mainChildId && !nodes.has(node.mainChildId)) node.mainChildId = null;
                });
                selectedChildren.clear();
                nodes.forEach(node => {
                    if (node.mainChildId) selectedChildren.set(node.id, node.mainChildId);
                });
                currentNodeId = originalLineIds.at(-1) || 'root';
                return Object.freeze({ ok: true, status: 'variations-reset' });
            },
            serialize,
            dispose() {
                active = false;
                [...nodes.values()].filter(node => node.source === 'local').forEach(node => nodes.delete(node.id));
                selectedChildren.clear();
                currentNodeId = 'root';
                return Object.freeze({ ok: true, status: 'disposed' });
            }
        });
    }

    function parseCollection(text, options = {}) {
        const parser = options.parser || root.PgnParser;
        const ChessCtor = options.Chess || root.Chess;
        if (!root.CaissaPgnCore?.parseCollection || !parser?.parse || !ChessCtor) {
            throw new Error('The CAISSA PGN/RAV parser is not available.');
        }
        return root.CaissaPgnCore.parseCollection(text, {
            parse: parser.parse,
            Chess: ChessCtor
        }, options);
    }

    const api = Object.freeze({ VERSION, START_FEN, create, parseCollection });
    root.CaissaAnalyzeVariationTree = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
