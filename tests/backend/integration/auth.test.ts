import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { SERVICE_URLS } from './config';

describe('Auth Service Integration', () => {
  const baseUrl = SERVICE_URLS.auth;
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User'
  };

  it('should register a new user', async () => {
    const response = await request(baseUrl)
      .post('/auth/signup')
      .send(testUser);
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toBeDefined();
    expect(response.body.data.user.email).toBe(testUser.email);
  });

  it('should login with valid credentials', async () => {
    // Add a small delay to avoid unique constraint violation on session creation
    // if the test runs too fast (token generation might produce identical tokens in same second)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const response = await request(baseUrl)
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeDefined();
  });

  it('should fail login with invalid credentials', async () => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: 'wrongpassword'
      });
    
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});

