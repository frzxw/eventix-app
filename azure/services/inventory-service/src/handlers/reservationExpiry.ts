import { InvocationContext } from "@azure/functions";
import { getDb, sql } from "../utils/db";
import { releaseInventory } from "../utils/inventoryService";
import { ServiceBusClient } from "@azure/service-bus";

export async function reservationExpiryHandler(myTimer: any, context: InvocationContext): Promise<void> {
  const now = new Date();
  const pool = await getDb();
  
  // Find expired orders (reservations)
  // Assuming we have an Orders table in SQL for authoritative state
  const result = await pool.request()
    .query(`
      SELECT * FROM Orders 
      WHERE status = 'pending_payment' 
      AND expires_at < GETDATE()
    `);
    
  const expiredOrders = result.recordset;
  
  if (expiredOrders.length === 0) {
    context.log('No expired reservations found.');
    return;
  }
  
  context.log(`Found ${expiredOrders.length} expired reservations.`);
  
  const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
  if (!connectionString) {
    context.error('SERVICE_BUS_CONNECTION_STRING is not set');
    return;
  }

  const sbClient = new ServiceBusClient(connectionString);
  const sender = sbClient.createSender('capacity-sync'); // Or a specific topic for cancellations
  
  for (const order of expiredOrders) {
    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      
      // Get order items to release inventory
      const itemsResult = await new sql.Request(tx)
        .input('orderId', sql.NVarChar, order.id)
        .query('SELECT * FROM OrderItems WHERE order_id = @orderId');
        
      for (const item of itemsResult.recordset) {
        await releaseInventory(tx, item.category_id, item.quantity);
      }
      
      // Update order status
      await new sql.Request(tx)
        .input('id', sql.NVarChar, order.id)
        .query("UPDATE Orders SET status = 'cancelled', payment_status = 'expired' WHERE id = @id");
        
      await tx.commit();
      
      // Publish event (optional, but good practice)
      // await sender.sendMessages({ body: { type: 'OrderExpired', orderId: order.id } });
      
    } catch (error) {
      context.error(`Failed to expire order ${order.id}`, error);
      await tx.rollback();
    }
  }
  
  await sbClient.close();
}
