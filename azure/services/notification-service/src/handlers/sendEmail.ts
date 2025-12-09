import type { InvocationContext } from '@azure/functions';
import { emailService } from '../utils/emailService';
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

export async function sendTicketEmailHandler(message: unknown, context: InvocationContext): Promise<void> {
  const payload = message as TicketIssuedMessage;
  if (!payload?.email || !payload?.ticketNumber) {
    context.log('SendTicketEmail: skipping invalid message');
    return;
  }

  context.log(`SendTicketEmail: sending ticket ${payload.ticketNumber} to ${payload.email}`);

  try {
    await emailService.send({
      to: payload.email,
      subject: `Your Eventix Ticket: ${payload.ticketNumber}`,
      html: `
        <h1>Your Ticket is Ready!</h1>
        <p>Here is your ticket for the event.</p>
        <p><strong>Ticket Number:</strong> ${payload.ticketNumber}</p>
        <p><strong>QR Code:</strong> <br/> <img src="${payload.qrCodeUrl}" alt="QR Code" /></p>
        <p>Please present this QR code at the entrance.</p>
      `,
      text: `Your ticket number is ${payload.ticketNumber}. Please access your account to view the QR code.`,
    });

    context.log(`SendTicketEmail: email sent to ${payload.email}`);
  } catch (error) {
    context.error('SendTicketEmail: failed', error);
    trackException(error as Error);
    throw error;
  }
}
