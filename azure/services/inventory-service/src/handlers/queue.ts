import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import {
  enqueueQueueRequest,
  getQueueStatus,
  leaveQueue,
  claimQueueHold,
} from '../utils/queueService';
import { checkRateLimit } from '../utils/rateLimit';
import { formatZodError, readJsonBody, ticketSelectionSchema } from '../utils/validation';
import {
  ok,
  badRequest,
  fail as serverError,
  tooManyRequests,
  notFound,
} from '../utils/response';

const identifierSchema = z.string().trim().min(1);

const joinQueueSchema = z
  .object({
    eventId: identifierSchema,
    selections: z.array(ticketSelectionSchema).min(1, 'At least one selection is required'),
    requesterId: identifierSchema.optional(),
    correlationId: identifierSchema.optional(),
    traceId: identifierSchema.optional(),
  })
  .strict();

const claimHoldSchema = z
  .object({
    queueId: identifierSchema,
    claimToken: identifierSchema.optional(),
    correlationId: identifierSchema.optional(),
  })
  .strict();

type JoinQueueBody = z.infer<typeof joinQueueSchema>;
type ClaimHoldBody = z.infer<typeof claimHoldSchema>;

export async function joinQueueHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    // Increased rate limit for load testing: 10000 requests per 60 seconds
    const rateLimit = await checkRateLimit(ip, 'queue_join', 10000, 60);

    if (!rateLimit.allowed) {
      return tooManyRequests(rateLimit.retryAfter);
    }

    const rawBody = await readJsonBody<JoinQueueBody>(req);
    if (!rawBody) {
      return badRequest('Invalid JSON payload');
    }

    const parsedBody = joinQueueSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return badRequest(formatZodError(parsedBody.error));
    }

    const { eventId, selections, requesterId, correlationId, traceId } = parsedBody.data;

    const result = await enqueueQueueRequest({
      eventId,
      selections,
      requesterId,
      correlationId,
      traceId,
    });

    return ok({
      status: 'queued',
      ...result,
      correlationId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return serverError(`Failed to join queue: ${message}`);
  }
}

export async function getQueueStatusHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const queueId = req.params.queueId;
    if (!queueId) {
      return badRequest('Queue ID is required');
    }

    const correlationId = req.headers.get('x-correlation-id') || undefined;
    const status = await getQueueStatus(queueId, correlationId);

    if (!status) {
      return notFound('Queue item not found');
    }

    return ok(status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return serverError(`Failed to get queue status: ${message}`);
  }
}

export async function leaveQueueHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const queueId = req.params.queueId;
    if (!queueId) {
      return badRequest('Queue ID is required');
    }

    const correlationId = req.headers.get('x-correlation-id') || undefined;
    const success = await leaveQueue(queueId, correlationId);

    if (!success) {
      return notFound('Queue item not found or could not be removed');
    }

    return ok({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return serverError(`Failed to leave queue: ${message}`);
  }
}

export async function claimQueueHoldHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<ClaimHoldBody>(req);
    if (!rawBody) {
      return badRequest('Invalid JSON payload');
    }

    const parsedBody = claimHoldSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return badRequest(formatZodError(parsedBody.error));
    }

    const { queueId, claimToken, correlationId } = parsedBody.data;

    const result = await claimQueueHold(queueId, correlationId, claimToken);

    if (result.success) {
      return ok(result);
    } else {
      return {
        status: 409, // Conflict or Precondition Failed
        jsonBody: result,
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return serverError(`Failed to claim hold: ${message}`);
  }
}
