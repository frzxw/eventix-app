import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Ticket Service Integration', () => {
  const baseUrl = SERVICE_URLS.ticket;

  it('should require auth for my-tickets', async () => {
    try {
      const response = await request(baseUrl)
        .get('/tickets/my-tickets');
      
      expect(response.status).toBe(401);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Ticket service not running at ' + baseUrl);
        throw error;
      }
      throw error;
    }
  });
});
