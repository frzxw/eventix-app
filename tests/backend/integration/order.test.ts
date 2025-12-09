import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Order Service Integration', () => {
  const baseUrl = SERVICE_URLS.order;

  it('should require auth for my-orders', async () => {
    try {
      const response = await request(baseUrl)
        .get('/my-orders');
      
      expect(response.status).toBe(401);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Order service not running at ' + baseUrl);
        throw error;
      }
      throw error;
    }
  });
});
