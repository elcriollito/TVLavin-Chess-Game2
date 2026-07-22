export function setIdempotentText(node, value, fallback = '—') {
    if (!node) return false;
    const next = String(value ?? fallback);
    if (node.textContent === next) return false;
    node.textContent = next;
    return true;
}
