import type { InvocationContext } from '@azure/functions';
import { containers } from '../utils/cosmos';
import { initTelemetry, trackException } from '../utils/telemetry';

initTelemetry();

type TicketIssuedMessage = {
  ticketId: string;
  ticketNumber: string;
  orderId: string;
  eventId: string;
  userId: string;
  email: string;
  qrCodeUrl: string;
  status: string;
};

export async function ticketProjectorHandler(message: unknown, context: InvocationContext): Promise<void> {
  const payload = message as TicketIssuedMessage;
  if (!payload?.ticketId) {
    context.log('TicketProjector: skipping invalid message');
    return;
  }

  context.log(`TicketProjector: projecting ticket ${payload.ticketId}`);

  try {
    // Fetch Event details for denormalization
    let event = null;
    try {
      const { resource } = await containers.events.item(payload.eventId, payload.eventId).read();
      event = resource;
    } catch {
      context.warn(`TicketProjector: event ${payload.eventId} not found in projection`);
    }

    // Fetch Order details for denormalization
    let order = null;
    try {
      const { resource } = await containers.orders.item(payload.orderId, payload.orderId).read();
      order = resource;
    } catch {
      context.warn(`TicketProjector: order ${payload.orderId} not found in projection`);
    }

    const ticketDoc = {
      id: payload.ticketId,
      ticketNumber: payload.ticketNumber,
      orderId: payload.orderId,
      eventId: payload.eventId,
      userId: payload.userId,
      email: payload.email,
      qrCodeUrl: payload.qrCodeUrl,
      status: payload.status,
      createdAt: new Date().toISOString(),
      event: event ? {
        id: event.id,
        title: event.title,
        date: event.date,
        venueName: event.venueName,
        venueCity: event.venueCity,
        imageUrl: event.imageUrl
      } : undefined,
      order: order ? {
        id: order.id,
        attendeeFirstName: order.attendeeFirstName,
        attendeeLastName: order.attendeeLastName,
        attendeeEmail: order.attendeeEmail
      } : undefined
    };

    await containers.tickets.items.upsert(ticketDoc);
    context.log(`TicketProjector: projected ticket ${payload.ticketId}`);

  } catch (error) {
    context.error('TicketProjector: failed', error);
    trackException(error as Error);
    throw error;
  }
}
