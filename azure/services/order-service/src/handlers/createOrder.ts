import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { getDb, sql } from '../utils/db';
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
    items: z.array(ticketSelectionSchema).min(1, 'At least one ticket selection is required'),
    holdToken: z.string().min(1, 'holdToken is required'),
    customerDetails: z
      .object({
        firstName: z.string().min(1, 'firstName is required'),
        lastName: z.string().min(1, 'lastName is required'),
        email: z.string().email('A valid attendee email is required'),
        phone: z.string().min(6, 'attendee phone must have at least 6 digits'),
        country: z.string().optional(),
      })
      .strict(),
    payment: z
      .object({
        method: z.string().optional(),
      })
      .optional(),
  })
  .strict();

type CreateOrderBody = z.infer<typeof createOrderSchema>;

export async function createOrderHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const userId = req.headers.get('x-user-id') || 'mock-user-id';

    const rawBody = await readJsonBody<CreateOrderBody>(req);
    const parsedBody = createOrderSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return badRequest(formatZodError(parsedBody.error));
    }
    const body = parsedBody.data;

    const tickets = body.items;
    const attendee = body.customerDetails;

    // Calculate Total
    // In a real app, we should fetch prices from DB (TicketCategories) to avoid client-side manipulation
    // For this implementation, we will fetch prices from DB
    const pool = await getDb();
    
    // Fetch categories
    const categoryIds = tickets.map(t => t.categoryId);
    // Create a parameter for each category ID
    const request = pool.request();
    // We can't pass array directly to IN clause easily in mssql without table-valued parameter or dynamic SQL
    // Simplified: fetch all categories for the event
    request.input('eventId', sql.NVarChar, body.eventId);
    const categoriesResult = await request.query('SELECT id, price FROM TicketCategories WHERE event_id = @eventId');
    const dbCategories = categoriesResult.recordset;

    let totalAmount = 0;
    const orderItems = [];

    for (const item of tickets) {
      const cat = dbCategories.find((c: any) => c.id === item.categoryId);
      if (!cat) {
          return badRequest(`Category ${item.categoryId} not found for this event`);
      }
      const price = Number(cat.price);
      totalAmount += price * item.quantity;
      orderItems.push({
        categoryId: item.categoryId,
        quantity: item.quantity,
        unitPrice: price,
      });
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const orderNumber = `ORD-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        // Insert Order
        await transaction.request()
            .input('id', sql.NVarChar, orderId)
            .input('orderNumber', sql.NVarChar, orderNumber)
            .input('userId', sql.NVarChar, userId)
            .input('eventId', sql.NVarChar, body.eventId)
            .input('holdToken', sql.NVarChar, body.holdToken)
            .input('status', sql.NVarChar, 'pending_payment')
            .input('firstName', sql.NVarChar, attendee.firstName)
            .input('lastName', sql.NVarChar, attendee.lastName)
            .input('email', sql.NVarChar, attendee.email)
            .input('phone', sql.NVarChar, attendee.phone)
            .input('subtotal', sql.Decimal(10, 2), totalAmount)
            .input('totalAmount', sql.Decimal(10, 2), totalAmount)
            .input('expiresAt', sql.DateTime2, expiresAt)
            .query(`
                INSERT INTO Orders (
                    id, order_number, user_id, event_id, hold_token, status, 
                    attendee_first_name, attendee_last_name, attendee_email, attendee_phone,
                    subtotal, total_amount, expires_at
                ) VALUES (
                    @id, @orderNumber, @userId, @eventId, @holdToken, @status,
                    @firstName, @lastName, @email, @phone,
                    @subtotal, @totalAmount, @expiresAt
                )
            `);

        // Insert Order Items
        for (const item of orderItems) {
            await transaction.request()
                .input('orderId', sql.NVarChar, orderId)
                .input('categoryId', sql.NVarChar, item.categoryId)
                .input('quantity', sql.Int, item.quantity)
                .input('unitPrice', sql.Decimal(10, 2), item.unitPrice)
                .query(`
                    INSERT INTO OrderItems (order_id, category_id, quantity, unit_price)
                    VALUES (@orderId, @categoryId, @quantity, @unitPrice)
                `);
        }

        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }

    // Publish Event
    /*
    await publishToTopic('order-created', {
      orderId: orderId,
      eventId: body.eventId,
      userId: userId,
      totalAmount: totalAmount,
      holdToken: body.holdToken,
    }, 'OrderCreated', body.eventId);
    */

    // Prepare for Midtrans Integration
    const midtransToken = `midtrans_token_${orderId}`; 
    const midtransRedirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${midtransToken}`;

    return created({
      success: true,
      data: {
        orderId: orderId,
        orderNumber: orderNumber,
        status: 'pending_payment',
        paymentLink: `/checkout/${orderId}`,
        payment: {
            token: midtransToken,
            redirectUrl: midtransRedirectUrl
        }
      },
    });

  } catch (error: any) {
    return fail(error.message || 'Internal Server Error');
  }
}
