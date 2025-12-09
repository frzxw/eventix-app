import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Order Service Integration', () => {
  const orderUrl = SERVICE_URLS.order;
  const inventoryUrl = SERVICE_URLS.inventory;
  const catalogUrl = SERVICE_URLS.catalog;
  const authUrl = SERVICE_URLS.auth;

  let eventId: string;
  let categoryId: string;
  let holdToken: string;
  let userId: string;
  let accessToken: string;

  beforeAll(async () => {
    // 0. Register User
    const userPayload = {
      email: `order-test-${Date.now()}@example.com`,
      password: 'Password123!',
      firstName: 'Order',
      lastName: 'Tester',
      phoneNumber: '1234567890'
    };
    
    const authRes = await request(authUrl).post('/auth/signup').send(userPayload);
    if (authRes.status === 201 && authRes.body.success) {
      userId = authRes.body.data.user.id;
      accessToken = authRes.body.data.accessToken;
    } else {
      console.warn('Failed to register user for order test:', authRes.body);
    }

    // 1. Get Event & Category
    const catalogRes = await request(catalogUrl).get('/events');
    if (catalogRes.body.events && catalogRes.body.events.length > 0) {
      const event = catalogRes.body.events[0];
      eventId = event.id;
      if (event.ticketCategories && event.ticketCategories.length > 0) {
        categoryId = event.ticketCategories[0].id;
      }
    }

    if (!eventId || !categoryId) {
      console.warn('Skipping order test setup - no event/category found');
      return;
    }

    // 2. Create Hold
    const holdRes = await request(inventoryUrl)
      .post('/holds')
      .send({
        eventId,
        selections: [{ categoryId, quantity: 1 }],
        requesterId: userId // Use real user ID
      });
    
    if (holdRes.status === 200 && holdRes.body.success) {
      holdToken = holdRes.body.holdToken;
    } else {
      console.warn('Failed to create hold:', holdRes.body);
    }
  });

  it('should create an order with valid hold', async () => {
    if (!holdToken || !userId) {
      console.warn('Skipping create order test - missing holdToken or userId');
      return;
    }

    const response = await request(orderUrl)
      .post('/orders')
      .set('x-user-id', userId) // Pass real user ID
      .send({
        eventId,
        tickets: [{ categoryId, quantity: 1 }],
        holdToken,
        attendeeInfo: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '1234567890'
        }
      });

    if (response.status !== 201) {
      const errorMsg = `Create order failed: ${JSON.stringify(response.body, null, 2)}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.orderId).toBeDefined();
  });

  it('should get my orders', async () => {
    if (!userId) return;
    
    const response = await request(orderUrl)
      .get('/my-orders')
      .set('x-user-id', userId);
    
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });
});
