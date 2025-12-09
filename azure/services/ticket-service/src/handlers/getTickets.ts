import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { containers } from '../utils/cosmos';
import type { SqlQuerySpec } from '@azure/cosmos';
import { extractTokenFromHeader, verifyAccessToken } from '../utils/auth';
import { initTelemetry, trackException } from '../utils/telemetry';

initTelemetry();

function ok(body: unknown): HttpResponseInit { return { status: 200, jsonBody: body }; }
function unauthorized(message: string): HttpResponseInit { return { status: 401, jsonBody: { success: false, error: 'UNAUTHORIZED', message } }; }
function fail(message: string): HttpResponseInit { return { status: 500, jsonBody: { success: false, error: 'SERVER_ERROR', message } }; }

export async function myTicketsHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const auth = extractTokenFromHeader(req.headers.get('authorization') || undefined);
    const userPayload = auth ? verifyAccessToken(auth) : null;
    if (!userPayload) return unauthorized('Authentication required');

    const querySpec: SqlQuerySpec = {
      query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
      parameters: [{ name: "@userId", value: userPayload.sub }]
    };

    const { resources: tickets } = await containers.tickets.items.query(querySpec).fetchAll();

    if (tickets.length === 0) {
      return ok({ success: true, tickets: [] });
    }

    const enrichedTickets = tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      qrCodeUrl: ticket.qrCodeUrl,
      qrCodeData: ticket.qrCodeData,
      barcodeData: ticket.barcodeData,
      createdAt: ticket.createdAt,
      event: ticket.event || { id: ticket.eventId },
      category: { id: ticket.categoryId },
      order: { id: ticket.orderId }
    }));

    return ok({ success: true, tickets: enrichedTickets });
  } catch (e: unknown) {
    const error = e as Error;
    context.error('MyTickets: failed', error);
    trackException(error);
    return fail(`Failed to fetch tickets: ${error?.message || 'Unknown error'}`);
  }
}
