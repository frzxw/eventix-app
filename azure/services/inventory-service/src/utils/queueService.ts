import { randomUUID } from 'crypto';
import { redis } from './redisClient';

export type QueueSelection = {
  categoryId: string;
  quantity: number;
};

export type QueueJoinRequest = {
  eventId: string;
  selections: QueueSelection[];
  requesterId?: string;
  correlationId?: string;
  traceId?: string;
};

export type QueueEntryStatus = 'queued' | 'ready' | 'expired' | 'cancelled';

export type QueueEntry = {
  queueId: string;
  eventId: string;
  selections: QueueSelection[];
  requesterId?: string;
  correlationId?: string;
  traceId?: string;
  status: QueueEntryStatus;
  createdAtIso: string;
  readyAtIso?: string;
  cancelledAtIso?: string;
  lastAttemptEpoch?: number;
  holdToken?: string;
  holdId?: string;
  holdExpiresAt?: string;
  message?: string;
};

export type QueueJoinResult = {
  queueId: string;
  position: number;
  etaSeconds: number;
};

export type QueueStatusResponse = {
  queueId: string;
  status: QueueEntryStatus;
  position?: number;
  etaSeconds?: number;
  holdToken?: string;
  holdExpiresAt?: string;
  message?: string;
};

export type QueueHoldClaimResponse = {
  success: boolean;
  holdId?: string;
  holdToken?: string;
  holdExpiresAt?: string;
  correlationId?: string;
  retryAfterSeconds?: number;
  reason?: string;
};

const QUEUE_KEY_PREFIX = 'queue:';
const QUEUE_DETAILS_PREFIX = 'queue:details:';

export async function enqueueQueueRequest(request: QueueJoinRequest): Promise<QueueJoinResult> {
  const queueId = randomUUID();
  const now = Date.now();
  const eventQueueKey = `${QUEUE_KEY_PREFIX}${request.eventId}`;
  
  // Add to sorted set with timestamp as score
  await redis.zadd(eventQueueKey, now, queueId);
  
  // Store details
  const detailsKey = `${QUEUE_DETAILS_PREFIX}${queueId}`;
  const entry: QueueEntry = {
      ...request,
      queueId,
      status: 'queued',
      createdAtIso: new Date(now).toISOString()
  };
  await redis.setex(detailsKey, 3600, JSON.stringify(entry));

  // Get position
  const rank = await redis.zrank(eventQueueKey, queueId);
  const position = (rank ?? 0) + 1;
  
  // Estimate ETA (e.g., 10 seconds per 100 users)
  const etaSeconds = Math.ceil(position / 10) * 5; 

  return {
    queueId,
    position,
    etaSeconds
  };
}

export async function getQueueStatus(queueId: string, _correlationId?: string): Promise<QueueStatusResponse | null> {
  const detailsKey = `${QUEUE_DETAILS_PREFIX}${queueId}`;
  const detailsStr = await redis.get(detailsKey);
  
  if (!detailsStr) return null;
  
  const details = JSON.parse(detailsStr) as QueueEntry;
  const eventQueueKey = `${QUEUE_KEY_PREFIX}${details.eventId}`;
  
  const rank = await redis.zrank(eventQueueKey, queueId);
  
  if (rank === null) {
      // Not in queue? Maybe expired or processed?
      return { queueId, status: 'expired' };
  }
  
  const position = rank + 1;
  
  // Logic for "Ready":
  // If position is within the "allowed" window. 
  // For this demo, let's say top 500 are always "ready" to try.
  const ALLOWED_CONCURRENCY = 500;
  
  if (position <= ALLOWED_CONCURRENCY) {
      return {
          queueId,
          status: 'ready',
          position,
          etaSeconds: 0,
          message: 'You are next! Proceed to booking.',
          // In a real flow, we might generate a temporary "pass" token here
          holdToken: queueId, // Reusing queueId as a simple token for now
          holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      };
  }

  return {
      queueId,
      status: 'queued',
      position,
      etaSeconds: Math.ceil(position / 10) * 5
  };
}

export async function leaveQueue(queueId: string, _correlationId?: string): Promise<boolean> {
  const detailsKey = `${QUEUE_DETAILS_PREFIX}${queueId}`;
  const detailsStr = await redis.get(detailsKey);
  
  if (!detailsStr) return false;
  
  const details = JSON.parse(detailsStr) as QueueEntry;
  const eventQueueKey = `${QUEUE_KEY_PREFIX}${details.eventId}`;
  
  await redis.zrem(eventQueueKey, queueId);
  await redis.del(detailsKey);
  
  return true;
}

export async function claimQueueHold(queueId: string, correlationId?: string, _claimToken?: string): Promise<QueueHoldClaimResponse> {
  // In this simplified Redis implementation, if they are in the "ready" zone, they can proceed.
  // We verify they are still in the queue and in the top N.
  const detailsKey = `${QUEUE_DETAILS_PREFIX}${queueId}`;
  const detailsStr = await redis.get(detailsKey);
  
  if (!detailsStr) {
      return { success: false, reason: 'QUEUE_EXPIRED' };
  }
  
  const details = JSON.parse(detailsStr) as QueueEntry;
  const eventQueueKey = `${QUEUE_KEY_PREFIX}${details.eventId}`;
  const rank = await redis.zrank(eventQueueKey, queueId);
  
  if (rank === null) {
      return { success: false, reason: 'NOT_IN_QUEUE' };
  }
  
  // Allow top 500
  if (rank > 500) {
      return { success: false, reason: 'NOT_READY', retryAfterSeconds: 5 };
  }

  // They are ready. We could remove them from queue here or let them expire.
  // Let's remove them to free up space for others.
  await redis.zrem(eventQueueKey, queueId);
  await redis.del(detailsKey);

  const now = Date.now();
  const expiresAtIso = new Date(now + 600 * 1000).toISOString();

  return {
    success: true,
    holdId: randomUUID(),
    holdToken: queueId, // Use queueId as token
    holdExpiresAt: expiresAtIso,
    correlationId
  };
}
