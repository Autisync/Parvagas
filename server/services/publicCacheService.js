const cache = new Map();
const inFlight = new Map();

function now() {
  return Date.now();
}

export function getCachedValue(key) {
  const hit = cache.get(key);
  if (!hit) return null;

  if (hit.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }

  return hit.value;
}

export function getStaleCachedValue(key) {
  const hit = cache.get(key);
  return hit ? hit.value : null;
}

export function setCachedValue(key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: now() + Math.max(1, Number(ttlMs) || 1),
  });
  return value;
}

export async function getOrSetCache(key, ttlMs, producer) {
  const cached = getCachedValue(key);
  if (cached !== null) return cached;

  const active = inFlight.get(key);
  if (active) return active;

  const pending = (async () => {
    const value = await producer();
    return setCachedValue(key, value, ttlMs);
  })();

  inFlight.set(key, pending);

  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

export function clearPublicCache(prefix = "") {
  const normalizedPrefix = String(prefix || "");
  if (!normalizedPrefix) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(normalizedPrefix)) {
      cache.delete(key);
    }
  }
}
