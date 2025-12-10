import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import {
  HOLD_TTL_SECONDS,
  acquireHold,
  extendHold as extendHoldService,
} from '../utils/holdService';
import { enqueueQueueRequest } from '../utils/queueService';
import { checkRateLimit } from '../utils/rateLimit';
import { formatZodError, readJsonBody, ticketSelectionSchema } from '../utils/validation';
import {
  ok,
  badRequest,
  fail as serverError,
  tooManyRequests,
} from '../utils/response';
import { trackReservationFailure } from '../utils/telemetry';

function normalizeCorrelationId(req: HttpRequest, fallback?: string): string | undefined {
  return req.headers.get('x-correlation-id') ?? fallback;
}

const identifierSchema = z.string().trim().min(1);

const holdAttemptSchema = z
  .object({
    eventId: identifierSchema,
    selections: z.array(ticketSelectionSchema).min(1, 'At least one selection is required'),
    requesterId: identifierSchema.optional(),
    correlationId: identifierSchema.optional(),
    traceId: identifierSchema.optional(),
  })
  .strict();

const holdExtendSchema = z
  .object({
    holdToken: identifierSchema,
    extendSeconds: z.number().int().positive().max(HOLD_TTL_SECONDS * 2).optional(),
    correlationId: identifierSchema.optional(),
  })
  .strict();

type HoldAttemptBody = z.infer<typeof holdAttemptSchema>;
type HoldExtendBody = z.infer<typeof holdExtendSchema>;

export async function attemptHoldHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    // Increased rate limit for load testing: 100000 requests per 60 seconds
    const rateLimit = await checkRateLimit(ip, 'hold', 100000, 60);

    if (!rateLimit.allowed) {
      return tooManyRequests(rateLimit.retryAfter);
    }

    const rawBody = await readJsonBody<HoldAttemptBody>(req);
    if (!rawBody) {
      return badRequest('Invalid JSON payload');
    }

    const parsedBody = holdAttemptSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return badRequest(formatZodError(parsedBody.error));
    }

    const { eventId, selections, requesterId, correlationId, traceId } = parsedBody.data;

    // Transform selections to HoldEntry format
    const entries = selections.map((s) => ({
      eventId,
      categoryId: s.categoryId,
      quantity: s.quantity,
    }));

    const result = await acquireHold({
      eventId,
      entries,
      requesterId,
      traceId,
    });

    if (result.success) {
      return ok({
        success: true,
        holdToken: result.holdToken,
        expiresAt: result.expiresAt,
        expiresAtEpoch: result.expiresAtEpoch,
      });
    } else {
      if (result.error === 'INSUFFICIENT_STOCK') {
        trackReservationFailure(eventId, 'INSUFFICIENT_STOCK');
        // If stock is insufficient, we might want to offer queueing
        // For now, just return 409 Conflict
        return {
          status: 409,
          jsonBody: {
            success: false,
            error: 'INSUFFICIENT_STOCK',
            message: 'Not enough tickets available',
            categoryId: result.categoryId,
            available: result.available,
          },
        };
      }
      return serverError(result.error || 'Unknown error acquiring hold');
    }
  } catch (error: any) {
    return serverError(error.message || 'Internal Server Error');
  }
}

export async function extendHoldHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawBody = await readJsonBody<HoldExtendBody>(req);
    if (!rawBody) return badRequest('Invalid JSON payload');

    const parsedBody = holdExtendSchema.safeParse(rawBody);
    if (!parsedBody.success) return badRequest(formatZodError(parsedBody.error));

    const { holdToken, extendSeconds } = parsedBody.data;
    const seconds = extendSeconds || HOLD_TTL_SECONDS;

    const success = await extendHoldService(holdToken, seconds);

    if (success) {
      return ok({ success: true, message: 'Hold extended' });
    } else {
      return { status: 404, jsonBody: { success: false, error: 'HOLD_NOT_FOUND', message: 'Hold not found or expired' } };
    }
  } catch (error: any) {
    return serverError(error.message);
  }
}
