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
        email: z.string().min(1, 'email is required'),
        phone: z.string().min(1, 'attendee phone is required'),
        country: z.string().optional(),
      }),
    payment: z
      .object({
        method: z.string().optional(),
      })
      .optional(),
  });

type CreateOrderBody = z.infer<typeof createOrderSchema>;

export async function createOrderHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const rawUserId = req.headers.get('x-user-id');

    // Allow unauthenticated checkout (guest checkout)
    // If x-user-id is present, use it. Otherwise, userId is null.
    let userId = rawUserId;
    if (!userId || userId === 'null' || userId === 'undefined' || userId.trim() === '') {
        userId = null;
    }

    const bodyText = await req.text();
    
    let rawBody: any;
    try {
        rawBody = JSON.parse(bodyText);
    } catch (e) {
        console.error('JSON Parse Error:', e);
        return badRequest('Invalid JSON body');
    }

    const parsedBody = createOrderSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const errorMsg = formatZodError(parsedBody.error);
      console.error('Validation Error:', errorMsg, 'Body:', JSON.stringify(rawBody));
      return badRequest(errorMsg);
    }
    const body = parsedBody.data;

    const tickets = body.items;
    const attendee = body.customerDetails;

    // Calculate Total
    // In a real app, we should fetch prices from DB (TicketCategories) to avoid client-side manipulation
    // For this implementation, we will fetch prices from DB
    const pool = await getDb();

    // Validate userId if present (handle stale sessions after DB reset)
    if (userId) {
        const userCheck = await pool.request()
            .input('id', sql.NVarChar, userId)
            .query('SELECT id FROM Users WHERE id = @id');
        
        if (userCheck.recordset.length === 0) {
            console.warn(`User ID ${userId} provided in header but not found in DB. Falling back to guest checkout.`);
            userId = null;
        }
    }
    
    // Fetch categories
    const categoryIds = tickets.map(t => t.categoryId);
    // Create a parameter for each category ID
    const request = pool.request();
    // We can't pass array directly to IN clause easily in mssql without table-valued parameter or dynamic SQL
    // Simplified: fetch all categories for the event
    request.input('eventId', sql.NVarChar, body.eventId);
    // Also fetch by ID directly if event_id check fails (in case of data inconsistency or cross-event booking attempt)
    const categoriesResult = await request.query('SELECT id, price, event_id FROM TicketCategories WHERE event_id = @eventId OR id IN (' + categoryIds.map(id => `'${id}'`).join(',') + ')');
    const dbCategories = categoriesResult.recordset;

    let totalAmount = 0;
    const orderItems = [];

    for (const item of tickets) {
      const cat = dbCategories.find((c: any) => c.id === item.categoryId);
      if (!cat) {
          console.error(`Category not found: ${item.categoryId} for event ${body.eventId}. Available: ${JSON.stringify(dbCategories)}`);
          return badRequest(`Category ${item.categoryId} not found for this event`);
      }
      // Optional: Verify event_id matches if we want to be strict
      // if (cat.event_id !== body.eventId) { ... }
      
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
    await publishToTopic('order-created', {
      orderId: orderId,
      eventId: body.eventId,
      userId: userId,
      totalAmount: totalAmount,
      holdToken: body.holdToken,
    }, 'OrderCreated', body.eventId);

    // Mock Payment Integration
    const mockPaymentUrl = `/payment/mock?orderId=${orderId}&amount=${totalAmount}`;

    return created({
      success: true,
      data: {
        orderId: orderId,
        orderNumber: orderNumber,
        status: 'pending_payment',
        paymentLink: mockPaymentUrl,
        payment: {
            token: 'mock-token',
            redirectUrl: mockPaymentUrl
        }
      },
    });

  } catch (error: any) {
    return fail(error.message || 'Internal Server Error');
  }
}
