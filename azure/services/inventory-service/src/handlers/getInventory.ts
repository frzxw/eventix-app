import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb, sql } from '../utils/db';
import { redis } from '../utils/redisClient';
import { ok, badRequest, fail } from '../utils/response';

export async function getInventoryHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const eventId = req.params.eventId;
  if (!eventId) {
    return badRequest('Missing eventId');
  }

  try {
    const db = await getDb();
    
    // 1. Get categories from SQL (Authoritative source for existence)
    const result = await db.request()
      .input('eventId', sql.NVarChar, eventId)
      .query(`
        SELECT id, quantity_total, available_quantity 
        FROM TicketCategories 
        WHERE event_id = @eventId
      `);

    const categories = result.recordset;
    if (categories.length === 0) {
      return ok({ eventId, inventory: [] });
    }

    // 2. Query Redis for real-time availability
    const pipeline = redis.pipeline();
    categories.forEach(cat => {
      pipeline.hgetall(`inventory:${eventId}:${cat.id}`);
    });

    const redisResults = await pipeline.exec();
    
    const inventory = [];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const [err, redisData] = redisResults![i] as [Error | null, Record<string, string>];
      
      if (!err && redisData && Object.keys(redisData).length > 0) {
        // Redis hit
        inventory.push({
          categoryId: cat.id,
          total: parseInt(redisData.total || '0', 10),
          sold: parseInt(redisData.sold || '0', 10),
          pending: parseInt(redisData.pending || '0', 10),
          available: parseInt(redisData.available || '0', 10),
          source: 'cache'
        });
      } else {
        // Redis miss - Fallback to SQL calculation
        // We need to count active reservations for this category
        // This is expensive, but necessary for correctness if cache is missing
        const resResult = await db.request()
          .input('eventId', sql.NVarChar, eventId)
          .input('categoryId', sql.NVarChar, cat.id)
          .query(`
            SELECT SUM(quantity) as reserved
            FROM Reservations
            WHERE event_id = @eventId 
              AND category_id = @categoryId
              AND status = 'active'
              AND expires_at > SYSDATETIME()
          `);
        
        const activeReservations = resResult.recordset[0].reserved || 0;
        // In SQL, available_quantity usually tracks confirmed sales. 
        // Real availability = quantity_total - sold - active_reservations
        // Assuming 'available_quantity' in TicketCategories is (total - sold)
        
        const sold = cat.quantity_total - cat.available_quantity;
        const available = cat.available_quantity - activeReservations;

        inventory.push({
          categoryId: cat.id,
          total: cat.quantity_total,
          sold: sold,
          pending: activeReservations,
          available: available > 0 ? available : 0,
          source: 'db'
        });

        // Optional: Trigger read-repair (populate Redis) asynchronously
        // We won't block the response for this
        populateRedis(eventId, cat.id, cat.quantity_total, sold, activeReservations);
      }
    }

    return ok({
      eventId,
      inventory
    });

  } catch (error) {
    context.error(`Error getting inventory for event ${eventId}`, error);
    return fail('Failed to retrieve inventory');
  }
}

async function populateRedis(eventId: string, categoryId: string, total: number, sold: number, reserved: number) {
  try {
    const inventoryKey = `inventory:${eventId}:${categoryId}`;
    const available = Math.max(0, total - sold - reserved);
    
    await redis.hset(inventoryKey, {
      total,
      sold,
      pending: reserved, // 'pending' in Redis maps to 'reserved' (active holds)
      available,
      version: 1 // Reset version or increment? 1 is fine for init
    });
    // Set TTL for safety? Inventory usually persistent, but maybe 1 hour?
    // redis.expire(inventoryKey, 3600);
  } catch (e) {
    console.error('Failed to populate Redis', e);
  }
}
