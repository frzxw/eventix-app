import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Catalog Service Integration', () => {
  const baseUrl = SERVICE_URLS.catalog;
  let eventId: string;

  it('should list events', async () => {
    const response = await request(baseUrl).get('/events');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.events)).toBe(true);
    expect(response.body.events.length).toBeGreaterThan(0);
    
    // Save an ID for the next test
    eventId = response.body.events[0].id;
  });

  it('should get event details', async () => {
    expect(eventId).toBeDefined();
    
    const response = await request(baseUrl).get(`/events/${eventId}`);
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.event).toBeDefined();
    expect(response.body.event.id).toBe(eventId);
    expect(response.body.event.title).toBeDefined();
    expect(response.body.event.ticketCategories).toBeDefined();
  });

  it('should return 404 for non-existent event', async () => {
    const response = await request(baseUrl).get('/events/non-existent-id');
    
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('should search events', async () => {
    const response = await request(baseUrl).get('/search?q=Concert');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.events)).toBe(true);
  });

  it('should list featured events', async () => {
    const response = await request(baseUrl).get('/events/featured');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.events)).toBe(true);
  });
});

