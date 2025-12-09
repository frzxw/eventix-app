import { randomUUID } from 'crypto';
import { redis, loadScript } from './redisClient';
import { ACQUIRE_HOLD_LUA, CLAIM_HOLD_LUA, RELEASE_HOLD_LUA, FINALIZE_HOLD_LUA } from './holdLuaScripts';

export const HOLD_TTL_SECONDS = Math.max(60, parseInt(process.env.HOLD_TTL_SECONDS ?? '600', 10));
const HOLD_KEY_PREFIX = 'holds:';
const HOLD_EXPIRATION_ZSET_KEY = 'holds:expiration-index';

let acquireHoldSha: string | undefined;
let claimHoldSha: string | undefined;
let releaseHoldSha: string | undefined;
let finalizeHoldSha: string | undefined;

export type HoldEntry = {
  eventId: string;
  categoryId: string;
  quantity: number;
};

export type HoldRequest = {
  eventId: string;
  requesterId?: string;
  traceId?: string;
  entries: HoldEntry[];
};

export type HoldAcquisitionResult = {
  success: boolean;
  holdToken?: string;
  expiresAt?: string;
  expiresAtEpoch?: number;
  error?: string;
  categoryId?: string;
  available?: number;
  entries?: Array<{
    categoryId: string;
    available: number;
    pending: number;
    total: number;
  }>;
};

export type HoldClaimResult = {
  success: boolean;
  error?: string;
  status?: string;
  entries?: HoldEntry[];
  expiresAt?: string;
  expiresAtEpoch?: number;
};

async function ensureScriptsLoaded() {
  if (!acquireHoldSha) acquireHoldSha = await loadScript(ACQUIRE_HOLD_LUA);
  if (!claimHoldSha) claimHoldSha = await loadScript(CLAIM_HOLD_LUA);
  if (!releaseHoldSha) releaseHoldSha = await loadScript(RELEASE_HOLD_LUA);
  if (!finalizeHoldSha) finalizeHoldSha = await loadScript(FINALIZE_HOLD_LUA);
}

export async function acquireHold(request: HoldRequest): Promise<HoldAcquisitionResult> {
  await ensureScriptsLoaded();

  const holdToken = randomUUID();
  const now = Date.now();
  const expiresAtEpoch = Math.floor((now + HOLD_TTL_SECONDS * 1000) / 1000);
  const expiresAtIso = new Date(now + HOLD_TTL_SECONDS * 1000).toISOString();
  const createdAtIso = new Date(now).toISOString();

  const payload = {
    holdToken,
    entries: request.entries,
    ttlSeconds: HOLD_TTL_SECONDS,
    keyTtlSeconds: HOLD_TTL_SECONDS + 60, // Keep key slightly longer than logical expiry
    createdAtIso,
    expiresAtIso,
    expiresAtEpoch,
    traceId: request.traceId,
    metadata: { requesterId: request.requesterId }
  };

  const keys: string[] = [];
  // Inventory keys
  for (const entry of request.entries) {
    keys.push(`inventory:${entry.eventId}:${entry.categoryId}`);
  }
  // Hold key
  keys.push(`${HOLD_KEY_PREFIX}${holdToken}`);
  // Expiration ZSET key
  keys.push(HOLD_EXPIRATION_ZSET_KEY);

  try {
    const resultJson = await redis.evalsha(
      acquireHoldSha!,
      keys.length,
      ...keys,
      JSON.stringify(payload)
    ) as string;

    const result = JSON.parse(resultJson);
    return result;
  } catch (error: any) {
    console.error('Error acquiring hold:', error);
    return { success: false, error: 'REDIS_ERROR' };
  }
}

export async function claimHold(holdToken: string): Promise<HoldClaimResult> {
  await ensureScriptsLoaded();
  const holdKey = `${HOLD_KEY_PREFIX}${holdToken}`;

  try {
    const resultJson = await redis.evalsha(
      claimHoldSha!,
      2,
      holdKey,
      HOLD_EXPIRATION_ZSET_KEY,
      holdToken
    ) as string;
    return JSON.parse(resultJson);
  } catch (error) {
    console.error('Error claiming hold:', error);
    return { success: false, error: 'REDIS_ERROR' };
  }
}

export async function releaseHold(holdToken: string): Promise<boolean> {
  await ensureScriptsLoaded();
  const holdKey = `${HOLD_KEY_PREFIX}${holdToken}`;

  try {
    const resultJson = await redis.evalsha(
      releaseHoldSha!,
      2,
      holdKey,
      HOLD_EXPIRATION_ZSET_KEY
    ) as string;
    const result = JSON.parse(resultJson);
    return result.success;
  } catch (error) {
    console.error('Error releasing hold:', error);
    return false;
  }
}

export async function markHoldCommitted(holdToken: string): Promise<boolean> {
  await ensureScriptsLoaded();
  const holdKey = `${HOLD_KEY_PREFIX}${holdToken}`;

  try {
    const resultJson = await redis.evalsha(
      finalizeHoldSha!,
      2,
      holdKey,
      HOLD_EXPIRATION_ZSET_KEY
    ) as string;
    const result = JSON.parse(resultJson);
    return result.success;
  } catch (error) {
    console.error('Error finalizing hold:', error);
    return false;
  }
}

export async function extendHold(holdToken: string, seconds: number): Promise<boolean> {
  const holdKey = `${HOLD_KEY_PREFIX}${holdToken}`;
  const exists = await redis.exists(holdKey);
  if (!exists) return false;

  const newExpiresAtEpoch = Math.floor(Date.now() / 1000) + seconds;
  await redis.expire(holdKey, seconds);
  await redis.zadd(HOLD_EXPIRATION_ZSET_KEY, newExpiresAtEpoch, holdKey);
  return true;
}
