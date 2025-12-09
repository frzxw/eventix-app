import { getDb, sql } from './db';

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  event_id: string;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  payment_intent_id?: string;
  stripe_session_id?: string;
  attendee_first_name: string;
  attendee_last_name: string;
  attendee_email: string;
  attendee_phone?: string;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
  hold_token?: string;
  payment_reference?: string;
  paid_at?: Date;
}

export interface OrderItem {
  id: string;
  order_id: string;
  category_id: string;
  quantity: number;
  unit_price: number;
  created_at: Date;
  updated_at: Date;
}

export async function findOrderById(id: string): Promise<Order | null> {
  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.NVarChar, id)
    .query('SELECT * FROM Orders WHERE id = @id');
  return result.recordset[0] || null;
}

export async function findOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
  const pool = await getDb();
  const result = await pool.request()
    .input('orderId', sql.NVarChar, orderId)
    .query('SELECT * FROM OrderItems WHERE order_id = @orderId');
  return result.recordset;
}

export async function createOrderTransaction(
  orderData: {
    userId: string;
    eventId: string;
    totalAmount: number;
    currency: string;
    status: string;
    paymentStatus: string;
    attendeeFirstName: string;
    attendeeLastName: string;
    attendeeEmail: string;
    attendeePhone?: string;
    expiresAt?: Date;
    holdToken?: string;
  },
  items: {
    categoryId: string;
    quantity: number;
    unitPrice: number;
  }[]
): Promise<Order> {
  const pool = await getDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const orderResult = await new sql.Request(tx)
      .input('orderNumber', sql.NVarChar, orderNumber)
      .input('userId', sql.NVarChar, orderData.userId)
      .input('eventId', sql.NVarChar, orderData.eventId)
      .input('totalAmount', sql.Decimal(10, 2), orderData.totalAmount)
      .input('currency', sql.NVarChar, orderData.currency)
      .input('status', sql.NVarChar, orderData.status)
      .input('paymentStatus', sql.NVarChar, orderData.paymentStatus)
      .input('attendeeFirstName', sql.NVarChar, orderData.attendeeFirstName)
      .input('attendeeLastName', sql.NVarChar, orderData.attendeeLastName)
      .input('attendeeEmail', sql.NVarChar, orderData.attendeeEmail)
      .input('attendeePhone', sql.NVarChar, orderData.attendeePhone)
      .input('expiresAt', sql.DateTime2, orderData.expiresAt)
      .input('holdToken', sql.NVarChar, orderData.holdToken)
      .query(`
        INSERT INTO Orders (
          order_number, user_id, event_id, total_amount, currency, status, payment_status,
          attendee_first_name, attendee_last_name, attendee_email, attendee_phone, expires_at, hold_token
        )
        OUTPUT INSERTED.*
        VALUES (
          @orderNumber, @userId, @eventId, @totalAmount, @currency, @status, @paymentStatus,
          @attendeeFirstName, @attendeeLastName, @attendeeEmail, @attendeePhone, @expiresAt, @holdToken
        )
      `);
    
    const order = orderResult.recordset[0];

    for (const item of items) {
      await new sql.Request(tx)
        .input('orderId', sql.NVarChar, order.id)
        .input('categoryId', sql.NVarChar, item.categoryId)
        .input('quantity', sql.Int, item.quantity)
        .input('unitPrice', sql.Decimal(10, 2), item.unitPrice)
        .query(`
          INSERT INTO OrderItems (order_id, category_id, quantity, unit_price)
          VALUES (@orderId, @categoryId, @quantity, @unitPrice)
        `);
    }

    await tx.commit();
    return order;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function updateOrder(id: string, data: {
  status?: string;
  paymentStatus?: string;
  paymentReference?: string | null;
  paidAt?: Date | null;
  expiresAt?: Date | null;
}, tx?: sql.Transaction): Promise<Order> {
  const pool = await getDb();
  const request = tx ? new sql.Request(tx) : pool.request();
  request.input('id', sql.NVarChar, id);
  
  const updates: string[] = [];
  
  if (data.status !== undefined) {
    request.input('status', sql.NVarChar, data.status);
    updates.push('status = @status');
  }
  if (data.paymentStatus !== undefined) {
    request.input('paymentStatus', sql.NVarChar, data.paymentStatus);
    updates.push('payment_status = @paymentStatus');
  }
  if (data.paymentReference !== undefined) {
    request.input('paymentReference', sql.NVarChar, data.paymentReference);
    updates.push('payment_reference = @paymentReference');
  }
  if (data.paidAt !== undefined) {
    request.input('paidAt', sql.DateTime2, data.paidAt);
    updates.push('paid_at = @paidAt');
  }
  if (data.expiresAt !== undefined) {
    request.input('expiresAt', sql.DateTime2, data.expiresAt);
    updates.push('expires_at = @expiresAt');
  }
  
  updates.push('updated_at = SYSDATETIME()');
  
  const query = `UPDATE Orders SET ${updates.join(', ')} OUTPUT INSERTED.* WHERE id = @id`;
  
  const result = await request.query(query);
  return result.recordset[0];
}

export async function findOrdersByUserId(userId: string, limit: number = 10, offset: number = 0): Promise<Order[]> {
  const pool = await getDb();
  const result = await pool.request()
    .input('userId', sql.NVarChar, userId)
    .input('limit', sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(`
      SELECT * FROM Orders
      WHERE user_id = @userId
      ORDER BY created_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);
  return result.recordset;
}
