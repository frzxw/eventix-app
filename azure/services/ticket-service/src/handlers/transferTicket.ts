import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { getDb, sql } from '../utils/db';
import { extractTokenFromHeader, verifyAccessToken } from '../utils/auth';
import { initTelemetry, trackException } from '../utils/telemetry';
import { publishToTopic } from '../utils/serviceBus';

initTelemetry();

const ticketIdSchema = z.object({
  id: z.string().cuid().or(z.string().uuid()),
});

const transferTicketSchema = z.object({
  toEmail: z.string().email(),
});

function ok(body: unknown): HttpResponseInit { return { status: 200, jsonBody: body }; }
function badRequest(message: string): HttpResponseInit { return { status: 400, jsonBody: { success: false, error: 'BAD_REQUEST', message } }; }
function unauthorized(message: string): HttpResponseInit { return { status: 401, jsonBody: { success: false, error: 'UNAUTHORIZED', message } }; }
function notFound(message: string): HttpResponseInit { return { status: 404, jsonBody: { success: false, error: 'NOT_FOUND', message } }; }
function fail(message: string): HttpResponseInit { return { status: 500, jsonBody: { success: false, error: 'SERVER_ERROR', message } }; }

function formatZodError(error: z.ZodError): string {
  return error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
}

export async function transferTicketHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = extractTokenFromHeader(req.headers.get('authorization') || undefined);
    const userPayload = auth ? verifyAccessToken(auth) : null;
    if (!userPayload) return unauthorized('Authentication required');

    const id = req.params.id;
    const parsedId = ticketIdSchema.safeParse({ id });
    if (!parsedId.success) return badRequest(formatZodError(parsedId.error));

    const body = (await req.json()) as { toEmail?: string };
    const parsedBody = transferTicketSchema.safeParse(body);
    if (!parsedBody.success) return badRequest(formatZodError(parsedBody.error));

    const ticketId = parsedId.data.id;
    const { toEmail } = parsedBody.data;

    const pool = await getDb();
    
    // Verify ownership
    // We need to join with Orders to check userId
    const ticketResult = await pool.request()
      .input('ticketId', sql.UniqueIdentifier, ticketId)
      .query(`
        SELECT t.*, o.user_id 
        FROM Tickets t
        JOIN Orders o ON t.order_id = o.id
        WHERE t.id = @ticketId
      `);
    
    const ticket = ticketResult.recordset[0];
    if (!ticket) return notFound('Ticket not found');
    if (ticket.user_id !== userPayload.sub) return unauthorized('Ticket does not belong to you');

    // Update ticket
    const updateResult = await pool.request()
      .input('ticketId', sql.UniqueIdentifier, ticketId)
      .input('toEmail', sql.NVarChar, toEmail)
      .input('transferredAt', sql.DateTime2, new Date())
      .query(`
        UPDATE Tickets
        SET transferred_to_email = @toEmail, transferred_at = @transferredAt, status = 'transferred'
        OUTPUT INSERTED.*
        WHERE id = @ticketId
      `);

    const updatedTicket = updateResult.recordset[0];

    // Publish Ticket Transferred Event
    await publishToTopic('ticket-transferred', {
      ticketId: updatedTicket.id,
      fromUserId: userPayload.sub,
      toEmail: toEmail,
      ticketNumber: updatedTicket.ticket_number,
      eventId: updatedTicket.event_id,
      correlationId: `TicketTransferred-${updatedTicket.id}`
    });

    return ok({ success: true, ticket: updatedTicket });
  } catch (e: unknown) {
    const error = e as Error;
    context.error('TransferTicket: failed', error);
    trackException(error);
    return fail(`Failed to transfer ticket: ${error?.message || 'Unknown error'}`);
  }
}
