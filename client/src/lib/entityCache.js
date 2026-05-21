// Shared entity-list cache used by DataverseInputConfig and DataverseOutputConfig.
// Module-level Map persists across component mount/unmount.
const _cache = new Map(); // orgUrl -> { list, ts }
const TTL    = 5 * 60 * 1000; // 5 minutes

export function getCachedEntities(orgUrl) {
  const c = _cache.get(orgUrl ?? '');
  return c && Date.now() - c.ts < TTL ? c.list : null;
}

export function setCachedEntities(orgUrl, list) {
  _cache.set(orgUrl ?? '', { list, ts: Date.now() });
}

export function clearEntityCache(orgUrl) {
  if (orgUrl === undefined) _cache.clear();
  else _cache.delete(orgUrl ?? '');
}
