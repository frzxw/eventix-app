import { InvocationContext } from '@azure/functions';
import { redis, loadScript } from '../utils/redisClient';
import { CLEANUP_EXPIRED_HOLDS_LUA } from '../utils/holdLuaScripts';

let cleanupScriptSha: string | undefined;

async function ensureScriptsLoaded(): Promise<void> {
  if (!cleanupScriptSha) {
    cleanupScriptSha = await loadScript(CLEANUP_EXPIRED_HOLDS_LUA);
  }
}

export async function redisCleanupHandler(myTimer: any, context: InvocationContext): Promise<void> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const HOLD_EXPIRATION_ZSET_KEY = 'holds:expiration-index';

  try {
    await ensureScriptsLoaded();
    
    const cleanedCount = await redis.evalsha(
      cleanupScriptSha!,
      1, // numKeys
      HOLD_EXPIRATION_ZSET_KEY,
      String(nowEpoch),
      '100' // limit
    );

    if (Number(cleanedCount) > 0) {
        context.log(`RedisCleanup: cleaned ${cleanedCount} expired holds`);
    }
  } catch (error) {
    context.error('RedisCleanup: failed', error);
  }
}
