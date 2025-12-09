import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Inventory Service Integration', () => {
  const inventoryUrl = SERVICE_URLS.inventory;
  const catalogUrl = SERVICE_URLS.catalog;
  
  let eventId: string;
  let categoryId: string;

  beforeAll(async () => {
    // Fetch a valid event and category to test with
    const response = await request(catalogUrl).get('/events');
    if (response.body.events && response.body.events.length > 0) {
      const event = response.body.events[0];
      eventId = event.id;
      if (event.ticketCategories && event.ticketCategories.length > 0) {
        categoryId = event.ticketCategories[0].id;
      }
    }
  });

  it('should attempt to hold a ticket', async () => {
    if (!eventId || !categoryId) {
      console.warn('Skipping hold test - no event/category found');
      return;
    }

    const response = await request(inventoryUrl)
      .post('/holds')
      .send({
        eventId,
        selections: [
          { categoryId, quantity: 1 }
        ],
        requesterId: `test-user-${Date.now()}`
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.holdToken).toBeDefined();
    expect(response.body.expiresAt).toBeDefined();
  });

  it('should reject hold with invalid data', async () => {
    const response = await request(inventoryUrl)
      .post('/holds')
      .send({
        eventId: 'invalid',
        categoryId: 'invalid',
        quantity: -1
      });
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

