import sql from 'mssql';

/**
 * Atomically reserves inventory for a ticket category.
 * Returns true if successful, false if insufficient inventory.
 * Uses SQL Server atomic UPDATE with WHERE clause for concurrency safety.
 */
export async function reserveInventory(
  tx: sql.Transaction,
  categoryId: string,
  quantity: number
): Promise<boolean> {
  const request = new sql.Request(tx);
  const result = await request
    .input('quantity', sql.Int, quantity)
    .input('categoryId', sql.NVarChar, categoryId)
    .query(`
      UPDATE TicketCategories
      SET available_quantity = available_quantity - @quantity
      WHERE id = @categoryId
        AND available_quantity >= @quantity
    `);
  
  return result.rowsAffected[0] > 0;
}

/**
 * Releases reserved inventory (e.g. on expiry or cancellation).
 */
export async function releaseInventory(
  tx: sql.Transaction,
  categoryId: string,
  quantity: number
): Promise<void> {
  const request = new sql.Request(tx);
  await request
    .input('quantity', sql.Int, quantity)
    .input('categoryId', sql.NVarChar, categoryId)
    .query(`
      UPDATE TicketCategories
      SET available_quantity = available_quantity + @quantity
      WHERE id = @categoryId
    `);
}

/**
 * Confirms inventory (moves from reserved to sold).
 */
export async function confirmInventory(
  tx: sql.Transaction,
  categoryId: string,
  quantity: number
): Promise<void> {
    // In this model, "reserved" inventory is already deducted from available.
    // "Confirming" might just mean updating a 'sold' counter if we track it separately,
    // but strictly speaking, if we deducted it, it's gone.
    // If we have a separate 'sold_quantity' column, we update it here.
    const request = new sql.Request(tx);
    await request
        .input('quantity', sql.Int, quantity)
        .input('categoryId', sql.NVarChar, categoryId)
        .query(`
        UPDATE TicketCategories
        SET quantity_total = quantity_total -- No change to total
        -- potentially update a sold counter if exists
        WHERE id = @categoryId
        `);
}
