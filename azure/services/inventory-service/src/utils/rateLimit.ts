import { redis } from './redisClient';
import { trackRateLimitHit } from './telemetry';

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]

-- Remove old entries (older than now - window)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

-- Count current entries
local count = redis.call('ZCARD', key)

if count < limit then
    -- Add new entry
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window)
    return {1, limit - count - 1, 0} -- Allowed, Remaining, RetryAfter
else
    -- Get oldest entry to calculate retry time
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfter = 0
    if oldest and oldest[2] then
        retryAfter = tonumber(oldest[2]) + window - now
    end
    if retryAfter < 0 then retryAfter = 0 end
    return {0, 0, retryAfter} -- Denied, Remaining, RetryAfter
end
`;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

export async function checkRateLimit(
  identifier: string,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = `ratelimit:${action}:${identifier}`;
  const now = Date.now() / 1000;
  const member = `${now}:${Math.random()}`;

  try {
    const result = (await redis.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      String(limit),
      String(windowSeconds),
      String(now),
      member
    )) as [number, number, number];

    const allowed = result[0] === 1;
    
    if (!allowed) {
      trackRateLimitHit(action, identifier);
    }

    return {
      allowed,
      remaining: result[1],
      retryAfter: result[2],
    };
  } catch (error) {
    console.error('Rate limit check failed', error);
    // Fail open if Redis is down
    return { allowed: true, remaining: 1, retryAfter: 0 };
  }
}
