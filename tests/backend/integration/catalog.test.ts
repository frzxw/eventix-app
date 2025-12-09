import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Catalog Service Integration', () => {
  const baseUrl = SERVICE_URLS.catalog;

  it('should list events', async () => {
    try {
      const response = await request(baseUrl)
        .get('/events');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Catalog service not running at ' + baseUrl);
        throw error;
      }
      throw error;
    }
  });
});
