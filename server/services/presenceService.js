const PRESENCE_TTL_SECONDS = Number(process.env.COMPANY_PRESENCE_TTL_SECONDS || 120);
const PRESENCE_PREFIX = "presence:company:";

const memoryStore = new Map();
let redisClientPromise = null;

async function getRedisClient() {
  if (!process.env.REDIS_URL) return null;
  if (redisClientPromise) return redisClientPromise;

  redisClientPromise = (async () => {
    try {
      const redisPkg = await import("redis");
      const client = redisPkg.createClient({ url: process.env.REDIS_URL });
      client.on("error", () => {});
      await client.connect();
      return client;
    } catch {
      return null;
    }
  })();

  return redisClientPromise;
}

function cleanupMemory(companyKey) {
  const now = Date.now();
  const users = memoryStore.get(companyKey) || new Map();
  for (const [uid, ts] of users.entries()) {
    if (now - ts > PRESENCE_TTL_SECONDS * 1000) users.delete(uid);
  }
  if (users.size === 0) memoryStore.delete(companyKey);
  else memoryStore.set(companyKey, users);
  return users;
}

export async function companyPresenceHeartbeat(companyId, userId) {
  const companyKey = String(companyId);
  const uid = String(userId);
  const redis = await getRedisClient();

  if (redis) {
    const key = `${PRESENCE_PREFIX}${companyKey}`;
    const now = Date.now();
    const minTs = now - PRESENCE_TTL_SECONDS * 1000;
    await redis.zRemRangeByScore(key, "-inf", `${minTs}`);
    await redis.zAdd(key, [{ score: now, value: uid }]);
    await redis.expire(key, PRESENCE_TTL_SECONDS * 2);
    const count = await redis.zCard(key);
    return { onlineUsersCount: count, isDoubleLogged: count >= 2, source: "redis" };
  }

  const users = cleanupMemory(companyKey);
  users.set(uid, Date.now());
  memoryStore.set(companyKey, users);
  const count = users.size;
  return { onlineUsersCount: count, isDoubleLogged: count >= 2, source: "memory" };
}

export async function companyPresenceStatus(companyId) {
  const companyKey = String(companyId);
  const redis = await getRedisClient();

  if (redis) {
    const key = `${PRESENCE_PREFIX}${companyKey}`;
    const now = Date.now();
    const minTs = now - PRESENCE_TTL_SECONDS * 1000;
    await redis.zRemRangeByScore(key, "-inf", `${minTs}`);
    const count = await redis.zCard(key);
    return { onlineUsersCount: count, isDoubleLogged: count >= 2, source: "redis" };
  }

  const users = cleanupMemory(companyKey);
  const count = users.size;
  return { onlineUsersCount: count, isDoubleLogged: count >= 2, source: "memory" };
}
