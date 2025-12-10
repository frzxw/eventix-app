import { InvocationContext } from '@azure/functions';
import { getHold, markHoldCommitted } from '../utils/holdService';
import { getDb, sql } from '../utils/db';

type OrderPaidMessage = {
  orderId: string;
  eventId: string;
  userId: string;
  holdToken: string;
  paymentReference: string;
};

function normalizeMessage(message: unknown): OrderPaidMessage | null {
    if (typeof message === 'object' && message !== null) {
        return message as OrderPaidMessage;
    }
    return null;
}

export async function finalizeHoldHandler(message: unknown, context: InvocationContext): Promise<void> {
  const payload = normalizeMessage(message);
  if (!payload?.holdToken) {
    context.log('FinalizeHold: skipping invalid message');
    return;
  }

  const { holdToken, eventId } = payload;
  context.log(`FinalizeHold: processing hold ${holdToken} for event ${eventId}`);

  try {
    // 1. Get hold details from Redis (before finalizing, as finalize deletes it)
    const entries = await getHold(holdToken);
    if (!entries) {
      context.warn(`FinalizeHold: hold ${holdToken} not found or already finalized`);
      // If it's not found, it might be expired or already finalized.
      // We should check SQL Reservations to be sure, but for now we assume it's done.
      return;
    }

    // 2. Update SQL (Authoritative Decrement)
    const db = await getDb();
    const transaction = new sql.Transaction(db);
    await transaction.begin();

    try {
      for (const entry of entries) {
        // Decrement available quantity in TicketCategories
        await transaction.request()
          .input('qty', sql.Int, entry.quantity)
          .input('catId', sql.NVarChar, entry.categoryId)
          .query(`
            UPDATE TicketCategories 
            SET available_quantity = available_quantity - @qty,
                updated_at = SYSDATETIME()
            WHERE id = @catId
          `);

        // Create Reservation Record (Confirmed)
        // We use MERGE to avoid duplicates if this handler runs twice
        await transaction.request()
          .input('holdToken', sql.NVarChar, holdToken)
          .input('eventId', sql.NVarChar, entry.eventId)
          .input('categoryId', sql.NVarChar, entry.categoryId)
          .input('quantity', sql.Int, entry.quantity)
          .query(`
            MERGE INTO Reservations AS target
            USING (SELECT @holdToken AS hold_token) AS source
            ON (target.hold_token = source.hold_token)
            WHEN MATCHED THEN
                UPDATE SET status = 'confirmed'
            WHEN NOT MATCHED THEN
                INSERT (hold_token, event_id, category_id, quantity, expires_at, status)
                VALUES (@holdToken, @eventId, @categoryId, @quantity, DATEADD(year, 1, SYSDATETIME()), 'confirmed');
          `);
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    // 3. Finalize in Redis (Remove hold, update stats)
    const success = await markHoldCommitted(holdToken);
    if (success) {
      context.log(`FinalizeHold: hold ${holdToken} finalized successfully`);
    } else {
      context.warn(`FinalizeHold: failed to finalize hold ${holdToken} in Redis (might be already done)`);
    }

  } catch (error) {
    context.error('FinalizeHold: failed', error);
    throw error; // Retry
  }
}
