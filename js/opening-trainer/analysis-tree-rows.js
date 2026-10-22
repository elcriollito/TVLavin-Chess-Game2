function orderedChildren(node, nodes) {
    const children = (node?.childrenIds || []).filter(id => nodes.has(id));
    if (!node?.mainChildId || !children.includes(node.mainChildId)) return children;
    return [node.mainChildId, ...children.filter(id => id !== node.mainChildId)];
}

/**
 * Derive scoresheet-style rows from the canonical half-move tree.
 * The returned rows only reference node IDs; the source tree remains untouched.
 */
export function buildPairedTreeRows(snapshot = {}) {
    const nodes = new Map((snapshot.nodes || []).map(node => [node.id, node]));
    const root = nodes.get('root');
    if (!root) return Object.freeze([]);

    const rows = [];
    const visited = new Set(['root']);

    function visit(nodeId, depth = 0, variation = false) {
        const node = nodes.get(nodeId);
        if (!node || visited.has(node.id)) return;
        visited.add(node.id);

        let white = node.color === 'w' ? node : null;
        let black = node.color === 'b' ? node : null;
        let endpoint = node;
        let pairedBlackId = null;

        if (white) {
            pairedBlackId = orderedChildren(white, nodes)
                .find(id => {
                    const candidate = nodes.get(id);
                    return candidate?.color === 'b' && candidate.moveNumber === white.moveNumber;
                }) || null;
            if (pairedBlackId) {
                black = nodes.get(pairedBlackId);
                endpoint = black;
                visited.add(black.id);
            }
        }

        rows.push(Object.freeze({
            id: `move-${node.moveNumber}-${white?.id || 'empty'}-${black?.id || 'empty'}`,
            moveNumber: node.moveNumber,
            depth,
            variation,
            whiteId: white?.id || null,
            blackId: black?.id || null,
            selectionNodeId: endpoint.id
        }));

        const continuation = orderedChildren(endpoint, nodes);
        continuation.forEach((childId, index) => visit(childId, depth + (index > 0 ? 1 : 0), variation || index > 0));

        if (white) {
            orderedChildren(white, nodes)
                .filter(id => id !== pairedBlackId)
                .forEach(childId => visit(childId, depth + 1, true));
        }
    }

    orderedChildren(root, nodes).forEach((childId, index) => visit(childId, index > 0 ? 1 : 0, index > 0));
    return Object.freeze(rows);
}

export default buildPairedTreeRows;
