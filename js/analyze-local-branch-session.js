(function installAnalyzeLocalBranchSession(root) {
    'use strict';

    const SCHEMA_VERSION = '2.0.0';
    if (root.CaissaAnalyzeLocalBranchSession?.schemaVersion === SCHEMA_VERSION) return;

    const copyMove = move => Object.freeze({ ...(move || {}) });
    const copyNode = node => Object.freeze({
        ...node,
        move: copyMove(node.move),
        childrenIds: Object.freeze([...node.childrenIds]),
        variationIds: Object.freeze(node.childrenIds.filter(id => id !== node.mainChildId))
    });

    function create({ handoffId = null, recordId = null, initialFen = null,
        originalMoves = [], sourceMoves = [], originalPgn = '', originalResult = '*',
        selectedPly = originalMoves.length || sourceMoves.length } = {}) {
        const suppliedMoves = originalMoves.length
            ? originalMoves
            : sourceMoves.map((san, index) => ({ san, ply: index + 1 }));
        const nodes = new Map();
        const selectedChildren = new Map();
        const originalLineIds = [];
        let localSequence = 0;
        let active = true;

        nodes.set('root', {
            id: 'root', parentId: null, san: null, uci: null, move: {},
            fen: initialFen, fenBefore: null, ply: 0, source: 'original',
            childrenIds: [], mainChildId: null
        });

        let parent = nodes.get('root');
        suppliedMoves.forEach((raw, index) => {
            const move = raw && typeof raw === 'object' ? raw : { san: String(raw || '') };
            const id = `original-${index + 1}`;
            const node = {
                id, parentId: parent.id, san: String(move.san || ''),
                uci: String(move.uci || `${move.from || ''}${move.to || ''}${move.promotion || ''}`),
                move: { ...move }, fen: move.fen || move.fenAfter || null,
                fenBefore: move.fenBefore || parent.fen || null,
                ply: Number.isSafeInteger(move.ply) ? move.ply : index + 1,
                moveNumber: Number.isSafeInteger(move.moveNumber) ? move.moveNumber : Math.floor(index / 2) + 1,
                color: move.color || (index % 2 === 0 ? 'w' : 'b'),
                source: 'original', childrenIds: [], mainChildId: null
            };
            nodes.set(id, node);
            parent.childrenIds.push(id);
            parent.mainChildId = id;
            selectedChildren.set(parent.id, id);
            originalLineIds.push(id);
            parent = node;
        });

        const boundedPly = Math.max(0, Math.min(
            Number.isSafeInteger(selectedPly) ? selectedPly : originalLineIds.length,
            originalLineIds.length
        ));
        let currentNodeId = boundedPly === 0 ? 'root' : originalLineIds[boundedPly - 1];

        function activeLineIds() {
            const line = [];
            let node = nodes.get('root');
            const visited = new Set(['root']);
            while (node) {
                const nextId = selectedChildren.get(node.id) || node.mainChildId;
                if (!nextId || visited.has(nextId) || !nodes.has(nextId)) break;
                visited.add(nextId);
                line.push(nextId);
                node = nodes.get(nextId);
            }
            return line;
        }

        function pathTo(nodeId) {
            const reverse = [];
            let node = nodes.get(nodeId);
            while (node && node.id !== 'root') {
                reverse.push(node.id);
                node = nodes.get(node.parentId);
            }
            return reverse.reverse();
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
            const target = nodes.get(nodeId);
            if (preferMainContinuation && target?.mainChildId) {
                selectedChildren.set(target.id, target.mainChildId);
            }
            currentNodeId = nodeId;
            return Object.freeze({ ok: true, status: 'selected', node: copyNode(target) });
        }

        function nodeMatchesMove(node, move) {
            const uci = String(move.uci || `${move.from || ''}${move.to || ''}${move.promotion || ''}`);
            if (uci && node.uci) return node.uci === uci;
            return node.san === String(move.san || '');
        }

        function inspect() {
            const lineIds = activeLineIds();
            return Object.freeze({
                schemaVersion: SCHEMA_VERSION, active, handoffId, recordId, initialFen,
                originalPgn, originalResult,
                originalLineIds: Object.freeze([...originalLineIds]),
                currentNodeId, currentFen: nodes.get(currentNodeId)?.fen || initialFen,
                activeLineIds: Object.freeze(lineIds),
                nodes: Object.freeze([...nodes.values()].map(copyNode)),
                localNodeCount: [...nodes.values()].filter(node => node.source === 'local').length,
                networkPolicy: 'local-only'
            });
        }

        return Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            inspect,
            getNode(nodeId) {
                const node = nodes.get(nodeId);
                return node ? copyNode(node) : null;
            },
            getCurrentNode() { return copyNode(nodes.get(currentNodeId)); },
            getActiveLine() { return activeLineIds().map(id => copyNode(nodes.get(id))); },
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
                        node: copyNode(nodes.get(existingId))
                    });
                }
                const id = `local-${++localSequence}`;
                const node = {
                    id, parentId: parent.id, san: String(move.san || ''),
                    uci: String(move.uci || `${move.from || ''}${move.to || ''}${move.promotion || ''}`),
                    move: { ...move }, fen: move.fen || move.fenAfter || null,
                    fenBefore: move.fenBefore || parent.fen || null,
                    ply: Number.isSafeInteger(move.ply) ? move.ply : parent.ply + 1,
                    moveNumber: Number.isSafeInteger(move.moveNumber) ? move.moveNumber : Math.floor(parent.ply / 2) + 1,
                    color: move.color || (parent.ply % 2 === 0 ? 'w' : 'b'),
                    source: 'local', childrenIds: [], mainChildId: null
                };
                nodes.set(id, node);
                parent.childrenIds.push(id);
                if (!parent.mainChildId) parent.mainChildId = id;
                selectedChildren.set(parent.id, id);
                currentNodeId = id;
                return Object.freeze({
                    ok: true, status: 'variation-created', created: true, node: copyNode(node)
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
                [...nodes.values()].forEach(node => {
                    node.childrenIds = node.childrenIds.filter(id => nodes.has(id));
                    if (node.mainChildId && !nodes.has(node.mainChildId)) node.mainChildId = null;
                });
                selectedChildren.clear();
                [...nodes.values()].forEach(node => {
                    if (node.mainChildId) selectedChildren.set(node.id, node.mainChildId);
                });
                currentNodeId = originalLineIds.at(-1) || 'root';
                return Object.freeze({ ok: true, status: 'variations-reset' });
            },
            dispose() {
                active = false;
                [...nodes.values()].filter(node => node.source === 'local').forEach(node => nodes.delete(node.id));
                selectedChildren.clear();
                currentNodeId = 'root';
                return Object.freeze({ ok: true, status: 'disposed' });
            }
        });
    }

    root.CaissaAnalyzeLocalBranchSession = Object.freeze({ schemaVersion: SCHEMA_VERSION, create });
})(window);
