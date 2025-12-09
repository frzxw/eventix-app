import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { containers } from '../utils/cosmos';
import type { SqlQuerySpec } from '@azure/cosmos';
import { initTelemetry, trackException } from '../utils/telemetry';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateQRCodeBuffer } from '../utils/qrcode';
import { z } from 'zod';

initTelemetry();

const ticketIdSchema = z.object({
  id: z.string().cuid().or(z.string().uuid()), // Support both CUID and UUID
});

function badRequest(message: string): HttpResponseInit { return { status: 400, jsonBody: { success: false, error: 'BAD_REQUEST', message } }; }
function notFound(message: string): HttpResponseInit { return { status: 404, jsonBody: { success: false, error: 'NOT_FOUND', message } }; }
function fail(message: string): HttpResponseInit { return { status: 500, jsonBody: { success: false, error: 'SERVER_ERROR', message } }; }

export async function downloadTicketPdfHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = req.params.id;
    const parsedId = ticketIdSchema.safeParse({ id });
    if (!parsedId.success) return badRequest('Invalid Ticket ID');

    const ticketId = parsedId.data.id;

    const querySpec: SqlQuerySpec = {
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: ticketId }]
    };
    const { resources } = await containers.tickets.items.query(querySpec).fetchAll();
    const ticket = resources[0];

    if (!ticket) return notFound('Ticket not found');

    // Generate PDF
    const event = ticket.event || {};
    const order = { attendeeFirstName: '', attendeeLastName: '', attendeeEmail: '', ...ticket.order };
    const category = ticket.category || {};

    const qrPayload = ticket.qrCodeData || `EVENTIX:${ticket.ticketNumber}:${ticket.eventId}:${ticket.orderId}`;
    const qrPng = await generateQRCodeBuffer(qrPayload);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const qrImage = await pdfDoc.embedPng(qrPng);

    const pad = 40;
    page.drawText('Eventix Ticket', { x: pad, y: height - pad - 12, size: 20, font: bold, color: rgb(0.35, 0.35, 0.9) });
    page.drawLine({ start: { x: pad, y: height - pad - 18 }, end: { x: width - pad, y: height - pad - 18 }, thickness: 1, color: rgb(0.85, 0.85, 0.95) });

    const yStart = height - pad - 60;
    let y = yStart;
    const textSize = 12;
    const lineGap = 18;

    const eventTitle = event?.title || 'Event';
    const when = event?.date ? new Date(event.date as string | number | Date).toLocaleDateString('en-US') : '';
    const venue = [event?.venueName, event?.venueCity].filter(Boolean).join(', ');
    const attendee = [order?.attendeeFirstName, order?.attendeeLastName].filter(Boolean).join(' ') || order?.attendeeEmail || '';
    const catName = category?.name ? ` (${category.name})` : '';

    page.drawText(`Event: ${eventTitle}`, { x: pad, y, size: textSize + 1, font: bold }); y -= lineGap;
    if (when) { page.drawText(`When: ${when}`, { x: pad, y, size: textSize, font }); y -= lineGap; }
    if (venue) { page.drawText(`Venue: ${venue}`, { x: pad, y, size: textSize, font }); y -= lineGap; }
    if (attendee) { page.drawText(`Attendee: ${attendee}`, { x: pad, y, size: textSize, font }); y -= lineGap; }
    page.drawText(`Ticket: ${ticket.ticketNumber}${catName}`, { x: pad, y, size: textSize, font }); y -= lineGap * 1.5;

    const qrSize = 180;
    const qrX = pad;
    const qrY = y - qrSize;
    page.drawRectangle({ x: qrX - 10, y: qrY - 10, width: qrSize + 20, height: qrSize + 20, color: rgb(0.97, 0.97, 0.99) });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText('Please present this QR at entry', { x: qrX, y: qrY - 16, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

    page.drawText('© Eventix — Secure, unique QR. Do not share.', { x: pad, y: 20, size: 9, font, color: rgb(0.45, 0.45, 0.45) });

    const pdfBytes = await pdfDoc.save();
    const filename = `Ticket-${ticket.ticketNumber}.pdf`;
    const headers = {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    };
    return { status: 200, headers, body: Buffer.from(pdfBytes) };
  } catch (e: unknown) {
    const error = e as Error;
    context.error('DownloadTicket: failed', error);
    trackException(error);
    return fail(`Failed to download ticket: ${error?.message || 'Unknown error'}`);
  }
}
