const KEY = 'caissa-scanner-beta-pending-sync-v1';

function read(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
}

function write(items, storage = localStorage) {
  storage.setItem(KEY, JSON.stringify(items));
}

export function enqueueSubmission(item, storage = localStorage) {
  const items = read(storage);
  const prior = items.find((entry) => entry.id === item.id);
  if (!prior) items.push({ ...item, status: 'pending-sync', queuedAt: new Date().toISOString() });
  write(items, storage);
  return items.length;
}

export async function flushSubmissions({ storage = localStorage, fetcher = fetch } = {}) {
  const items = read(storage), pending = [];
  let synced = 0;
  for (const item of items) {
    try {
      const response = await fetcher(item.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      synced += 1;
    } catch (_) { pending.push(item); }
  }
  write(pending, storage);
  return { synced, pending: pending.length };
}

export function pendingCount(storage = localStorage) { return read(storage).length; }
