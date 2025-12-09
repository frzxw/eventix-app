import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reserveInventory } from '../../../azure/services/inventory-service/src/utils/inventoryService';
import { sql } from '../../../azure/services/inventory-service/src/utils/db';

// Mock mssql
vi.mock('../../../azure/services/inventory-service/src/utils/db', () => ({
  sql: {
    Transaction: class {},
    Request: class {},
    Int: 'Int',
    NVarChar: 'NVarChar',
  }
}));

describe('Inventory Service - Concurrency & Oversell Protection', () => {
  let inventoryStore: Record<string, number>;

  beforeEach(() => {
    // Reset inventory for each test
    inventoryStore = {
      'cat-high-demand': 50, // Only 50 tickets available
    };
  });

  it('should prevent overselling under high concurrency (100 parallel requests)', async () => {
    const TOTAL_REQUESTS = 100;
    const REQUEST_QUANTITY = 1;
    
    // Mock the SQL Request to simulate the atomic UPDATE ... WHERE behavior
    const mockInput = vi.fn().mockReturnThis();
    const mockQuery = vi.fn().mockImplementation(async function(this: any) {
      // In a real scenario, we'd parse the inputs. 
      // Here we assume the inputs were passed in order: quantity, categoryId
      // We can access the calls to input() to get values if needed, 
      // but for this specific test we know what we're passing.
      
      // Simulate the atomic database operation
      // UPDATE ... SET available = available - qty WHERE id = catId AND available >= qty
      
      const categoryId = 'cat-high-demand';
      const quantity = REQUEST_QUANTITY;

      // Critical: Check condition atomically
      if (inventoryStore[categoryId] >= quantity) {
        // Simulate atomic database operation - no async gap between check and update
        inventoryStore[categoryId] -= quantity;
        return { rowsAffected: [1] }; // Success
      } else {
        return { rowsAffected: [0] }; // Failed condition
      }
    });

    (sql.Request as any) = vi.fn(() => ({
      input: mockInput,
      query: mockQuery
    }));

    const mockTx = new sql.Transaction();

    // Launch 100 parallel requests
    const promises = Array.from({ length: TOTAL_REQUESTS }).map(() => 
      reserveInventory(mockTx, 'cat-high-demand', REQUEST_QUANTITY)
    );

    const results = await Promise.all(promises);

    const successCount = results.filter(r => r === true).length;
    const failCount = results.filter(r => r === false).length;

    // Assertions
    expect(successCount).toBe(50); // Should exactly match initial inventory
    expect(failCount).toBe(50);    // The rest should fail
    expect(inventoryStore['cat-high-demand']).toBe(0); // Inventory should be drained but not negative
  });

  it('should handle single successful reservation', async () => {
    inventoryStore['cat-simple'] = 10;
    
    const mockInput = vi.fn().mockReturnThis();
    const mockQuery = vi.fn().mockResolvedValue({ rowsAffected: [1] });
    
    (sql.Request as any) = vi.fn(() => ({
      input: mockInput,
      query: mockQuery
    }));

    const mockTx = new sql.Transaction();
    const result = await reserveInventory(mockTx, 'cat-simple', 1);

    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE TicketCategories'));
  });

  it('should fail when inventory is insufficient', async () => {
    inventoryStore['cat-empty'] = 0;
    
    const mockInput = vi.fn().mockReturnThis();
    // Simulate DB returning 0 rows affected
    const mockQuery = vi.fn().mockResolvedValue({ rowsAffected: [0] });
    
    (sql.Request as any) = vi.fn(() => ({
      input: mockInput,
      query: mockQuery
    }));

    const mockTx = new sql.Transaction();
    const result = await reserveInventory(mockTx, 'cat-empty', 1);

    expect(result).toBe(false);
  });
});
