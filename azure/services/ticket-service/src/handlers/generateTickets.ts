import type { InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import { getDb, sql } from '../utils/db';
import { createTicket, findTicketsByOrderId } from '../utils/ticketRepository';
import { generateTicketQRCode } from '../utils/qrcode';
import { uploadBufferToBlob } from '../utils/storage';
import { publishToTopic } from '../utils/serviceBus';
import { initTelemetry, trackException } from '../utils/telemetry';

initTelemetry();

type OrderPaidMessage = {
  orderId: string;
  eventId: string;
  userId: string;
  holdToken: string;
  paymentReference: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  category_id: string;
  quantity: number;
  category_name: string; // We need to join with TicketCategories
};

async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const pool = await getDb();
  const result = await pool.request()
    .input('orderId', sql.UniqueIdentifier, orderId)
    .query(`
      SELECT oi.*, tc.name as category_name
      FROM OrderItems oi
      JOIN TicketCategories tc ON oi.category_id = tc.id
      WHERE oi.order_id = @orderId
    `);
  return result.recordset;
}

async function getOrderDetails(orderId: string): Promise<{ order_number: string; attendee_email: string } | null> {
    const pool = await getDb();
    const result = await pool.request()
        .input('orderId', sql.UniqueIdentifier, orderId)
        .query('SELECT order_number, attendee_email FROM Orders WHERE id = @orderId');
    return result.recordset[0] || null;
}

export async function generateTicketsHandler(message: unknown, context: InvocationContext): Promise<void> {
  const payload = message as OrderPaidMessage;
  if (!payload?.orderId) {
    context.log('GenerateTickets: skipping invalid message');
    return;
  }

  context.log(`GenerateTickets: processing order ${payload.orderId}`);

  try {
    // Idempotency check: check if tickets already exist for this order
    const existingTickets = await findTicketsByOrderId(payload.orderId);
    if (existingTickets.length > 0) {
      context.log(`GenerateTickets: tickets already exist for order ${payload.orderId}`);
      return;
    }

    const orderItems = await getOrderItems(payload.orderId);
    if (orderItems.length === 0) {
      context.error(`GenerateTickets: no items found for order ${payload.orderId}`);
      return;
    }

    const orderDetails = await getOrderDetails(payload.orderId);
    if (!orderDetails) {
        context.error(`GenerateTickets: order details not found for order ${payload.orderId}`);
        return;
    }
    const { order_number: orderNumber, attendee_email: attendeeEmail } = orderDetails;

    const ticketNumberBase = `TKT-${orderNumber}`;
    const generatedTickets = [];

    for (const item of orderItems) {
      for (let i = 0; i < item.quantity; i++) {
        const ticketId = randomUUID();
        const ticketNumber = `${ticketNumberBase}-${item.category_name}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        
        const { qrCodeData, qrCodeBuffer } = await generateTicketQRCode(ticketNumber, payload.eventId, payload.orderId);

        let qrUrl: string | null = null;
        try {
          const blobName = `${ticketNumber}.png`;
          const container = process.env.QR_CODES_CONTAINER || 'qr-codes';
          const url = await uploadBufferToBlob(qrCodeBuffer, container, blobName);
          if (url) {
            qrUrl = url;
          }
        } catch (error) {
          context.error(`GenerateTickets: failed to upload QR for ticket ${ticketNumber}`, error);
        }

        const ticket = await createTicket({
          id: ticketId,
          order_id: payload.orderId,
          event_id: payload.eventId,
          category_id: item.category_id,
          ticket_number: ticketNumber,
          status: 'valid',
          qr_code_url: qrUrl,
          qr_code_data: qrCodeData,
          barcode_data: '', // Schema allows null but type expects string, using empty string for now or update type
        });

        generatedTickets.push(ticket);
      }
    }

    context.log(`GenerateTickets: generated ${generatedTickets.length} tickets for order ${payload.orderId}`);

    // Publish Ticket Issued Event
    for (const ticket of generatedTickets) {
      await publishToTopic('ticket-issued', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        orderId: ticket.order_id,
        eventId: ticket.event_id,
        userId: payload.userId,
        email: attendeeEmail,
        qrCodeUrl: ticket.qr_code_url,
        status: ticket.status,
        correlationId: `TicketIssued-${ticket.id}`
      });
    }

  } catch (error) {
    context.error('GenerateTickets: failed', error);
    trackException(error as Error);
    throw error;
  }
}
