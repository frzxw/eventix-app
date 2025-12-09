import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import * as orderRepo from '../utils/orderRepository';
import * as eventRepo from '../utils/eventRepository';
import { publishToTopic } from '../utils/serviceBus';
import { formatZodError, readJsonBody, ticketSelectionSchema } from '../utils/validation';
import {
  ok,
  badRequest,
  notFound,
  fail,
  created,
} from '../utils/response';

const createOrderSchema = z
  .object({
    eventId: z.string().min(1, 'eventId is required'),
    tickets: z.array(ticketSelectionSchema).min(1, 'At least one ticket selection is required'),
    holdToken: z.string().min(1, 'holdToken is required'),
    attendeeInfo: z
      .object({
        firstName: z.string().min(1, 'firstName is required'),
        lastName: z.string().min(1, 'lastName is required'),
        email: z.string().email('A valid attendee email is required'),
        phone: z.string().min(6, 'attendee phone must have at least 6 digits'),
      })
      .strict(),
  })
  .strict();

type CreateOrderBody = z.infer<typeof createOrderSchema>;

export async function createOrderHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    // Note: Authentication should be handled by middleware or extracted from headers
    // For simplicity, assuming user ID is passed in header or we use a mock ID
    const userId = req.headers.get('x-user-id') || 'mock-user-id';

    const rawBody = await readJsonBody<CreateOrderBody>(req);
    const parsedBody = createOrderSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return badRequest(formatZodError(parsedBody.error));
    }
    const body = parsedBody.data;

    // Validate Event
    const event = await eventRepo.findEventById(body.eventId);
    if (!event) {
      return notFound('Event not found');
    }

    // Validate Categories
    const categoryIds = body.tickets.map((t) => t.categoryId);
    const categories = await eventRepo.findTicketCategoriesByIds(categoryIds);
    if (categories.length !== categoryIds.length) {
      return badRequest('One or more ticket categories not found');
    }

    // Calculate Total
    let totalAmount = 0;
    const orderItems = [];
    for (const item of body.tickets) {
      const cat = categories.find((c) => c.id === item.categoryId);
      if (!cat) continue;
      totalAmount += Number(cat.price) * item.quantity;
      orderItems.push({
        categoryId: item.categoryId,
        quantity: item.quantity,
        unitPrice: Number(cat.price),
      });
    }

    // Create Order
    const order = await orderRepo.createOrderTransaction(
      {
        userId,
        eventId: body.eventId,
        totalAmount,
        currency: 'USD', // Default for now
        status: 'pending_payment',
        paymentStatus: 'pending',
        attendeeFirstName: body.attendeeInfo.firstName,
        attendeeLastName: body.attendeeInfo.lastName,
        attendeeEmail: body.attendeeInfo.email,
        attendeePhone: body.attendeeInfo.phone,
        holdToken: body.holdToken,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins to pay
      },
      orderItems
    );

    // Publish Event
    await publishToTopic('order-created', {
      orderId: order.id,
      eventId: order.event_id,
      userId: order.user_id,
      totalAmount: order.total_amount,
      holdToken: body.holdToken,
    }, 'OrderCreated', order.event_id);

    return created({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentLink: `/checkout/${order.id}`, // Mock link
    });

  } catch (error: any) {
    return fail(error.message || 'Internal Server Error');
  }
}
