import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Auth Service Integration', () => {
  const baseUrl = SERVICE_URLS.auth;

  it('should fail login with invalid credentials', async () => {
    // We assume the service is running. If not, this will fail with connection refused.
    try {
      const response = await request(baseUrl)
        .post('/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'wrongpassword'
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.warn('Auth service not running at ' + baseUrl);
        // Skip test if service is not running? Or fail?
        // For now, let's fail to indicate setup is needed.
        throw error;
      }
      throw error;
    }
  });
});
