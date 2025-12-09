import { randomUUID } from 'crypto';
import { containers } from './cosmos';
import { redis } from './redisClient';
import {
  HOLD_TTL_SECONDS,
  acquireHold,
  claimHold,
  releaseHold,
} from './holdService';

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

export async function enqueueQueueRequest(request: QueueJoinRequest): Promise<QueueJoinResult> {
  // Simplified queue logic for now - just return a mock response or implement basic Redis list
  // In a real implementation, this would add to a Redis List or Sorted Set
  const queueId = randomUUID();
  return {
    queueId,
    position: 1,
    etaSeconds: 5
  };
}

export async function getQueueStatus(queueId: string, _correlationId?: string): Promise<QueueStatusResponse | null> {
  // Mock implementation: Always return ready to unblock the flow
  const now = Date.now();
  const expiresAtIso = new Date(now + 600 * 1000).toISOString(); // 10 minutes from now

  return {
    queueId,
    status: 'ready',
    position: 0,
    etaSeconds: 0,
    message: 'Your turn! Proceed to checkout.',
    holdToken: randomUUID(),
    holdExpiresAt: expiresAtIso
  };
}

export async function leaveQueue(_queueId: string, _correlationId?: string): Promise<boolean> {
  // Mock implementation
  return true;
}

export async function claimQueueHold(_queueId: string, correlationId?: string, _claimToken?: string): Promise<QueueHoldClaimResponse> {
  const now = Date.now();
  const expiresAtIso = new Date(now + 600 * 1000).toISOString();

  return {
    success: true,
    holdId: randomUUID(),
    holdToken: randomUUID(),
    holdExpiresAt: expiresAtIso,
    correlationId
  };
}
