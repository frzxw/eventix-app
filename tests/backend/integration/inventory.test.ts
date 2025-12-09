import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Inventory Service Integration', () => {
  const baseUrl = SERVICE_URLS.inventory;

  it('should reject hold with invalid data', async () => {
    try {
      const response = await request(baseUrl)
        .post('/holds')
        .send({});
      
      expect(response.status).toBe(400);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Inventory service not running at ' + baseUrl);
        throw error;
      }
      throw error;
    }
  });
});
