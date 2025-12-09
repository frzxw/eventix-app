import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { getDb, sql } from '../utils/db';
import {
  checkIdempotency,
  lockIdempotencyKey,
  saveIdempotencyResult,
  releaseIdempotencyLock,
} from '../utils/idempotency';
import { sendToFinalizationQueue } from '../utils/serviceBus';
import { formatZodError, readJsonBody } from '../utils/validation';
import {
  ok,
  badRequest,
  conflict,
  fail,
} from '../utils/response';
import { trackIdempotencyConflict } from '../utils/telemetry';

const processPaymentSchema = z
  .object({
    orderId: z.string().min(1, 'orderId is required'),
    amount: z.number().positive('amount must be positive'),
    currency: z.string().min(3, 'currency is required'),
    paymentMethod: z.string().min(1, 'paymentMethod is required'),
    token: z.string().optional(), // Mock token
  })
  .strict();

type ProcessPaymentBody = z.infer<typeof processPaymentSchema>;

export async function processPaymentHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const idempotencyKey = req.headers.get('idempotency-key');
  if (idempotencyKey) {
    const existing = await checkIdempotency(idempotencyKey);
    if (existing) {
      if (existing.status === 'processing') {
        trackIdempotencyConflict(idempotencyKey, 'processing');
        return conflict('Request is currently being processed');
      }
      if (existing.status === 'completed' && existing.responseBody) {
        return {
          status: existing.responseStatus || 200,
          jsonBody: existing.responseBody,
        };
      }
    }

    const locked = await lockIdempotencyKey(idempotencyKey);
    if (!locked) {
      trackIdempotencyConflict(idempotencyKey, 'locked');
      return conflict('Request is currently being processed');
    }
  }

  try {
    const rawBody = await readJsonBody<ProcessPaymentBody>(req);
    const parsedBody = processPaymentSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      if (idempotencyKey) await releaseIdempotencyLock(idempotencyKey);
      return badRequest(formatZodError(parsedBody.error));
    }
    const body = parsedBody.data;

    // Mock Payment Processing
    // In a real app, we would call Stripe/PayPal here
    const paymentReference = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paidAt = new Date().toISOString();

    // Save to PaymentLogs
    const pool = await getDb();
    await pool.request()
        .input('orderId', sql.NVarChar, body.orderId)
        .input('paymentMethod', sql.NVarChar, body.paymentMethod)
        .input('amount', sql.Decimal(10, 2), body.amount)
        .input('currency', sql.NVarChar, body.currency)
        .input('status', sql.NVarChar, 'completed')
        .input('gatewayReference', sql.NVarChar, paymentReference)
        .query(`
            INSERT INTO PaymentLogs (order_id, paymentMethod, amount, currency, status, gateway_reference)
            VALUES (@orderId, @paymentMethod, @amount, @currency, @status, @gatewayReference)
        `);

    // Send to Finalization Queue (Order Service listens to this)
    await sendToFinalizationQueue({
      orderId: body.orderId,
      paymentReference,
      paidAt,
      eventId: 'unknown', // Ideally we should have eventId in the request or look it up
    });

    const responseBody = {
      success: true,
      paymentReference,
      status: 'completed',
    };

    if (idempotencyKey) {
      await saveIdempotencyResult(idempotencyKey, 'completed', 200, responseBody);
    }

    return ok(responseBody);

  } catch (error: any) {
    if (idempotencyKey) {
      await saveIdempotencyResult(idempotencyKey, 'failed', 500, { error: error.message });
    }
    return fail(error.message || 'Internal Server Error');
  }
}
