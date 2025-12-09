import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  scenarios: {
    ticket_war: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, // Ramp up to 50 users
        { duration: '1m', target: 50 },  // Stay at 50 users
        { duration: '30s', target: 0 },   // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:7073/api'; // Inventory Service URL
const ORDER_URL = __ENV.ORDER_URL || 'http://localhost:7074/api';
const PAYMENT_URL = __ENV.PAYMENT_URL || 'http://localhost:7075/api';

export default function () {
  const eventId = 'evt-001';
  const categoryId = 'cat-001-1';
  const userId = `user-${randomString(8)}`;
  
  // 1. Join Queue
  const joinPayload = JSON.stringify({
    eventId: eventId,
    selections: [{ categoryId: categoryId, quantity: 1 }],
    requesterId: userId
  });
  
  const joinRes = http.post(`${BASE_URL}/queue/join`, joinPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const joined = check(joinRes, {
    'joined queue': (r) => r.status === 200,
  });
  
  if (!joined) {
      return;
  }
  
  const queueId = joinRes.json('queueId');
  
  // 2. Poll Status
  let ready = false;
  let attempts = 0;
  
  while (!ready && attempts < 20) {
      sleep(1);
      const statusRes = http.get(`${BASE_URL}/queue/status/${queueId}`);
      
      if (statusRes.status === 200) {
          const status = statusRes.json('status');
          if (status === 'ready') {
              ready = true;
          }
      }
      attempts++;
  }
  
  if (!ready) {
      return;
  }
  
  // 3. Attempt Hold
  const holdPayload = JSON.stringify({
    eventId: eventId,
    selections: [{ categoryId: categoryId, quantity: 1 }],
    requesterId: userId,
  });
  
  const holdRes = http.post(`${BASE_URL}/holds`, holdPayload, {
      headers: { 'Content-Type': 'application/json' },
  });
  
  const holdAcquired = check(holdRes, {
      'hold acquired': (r) => r.status === 200,
      'hold failed (stock)': (r) => r.status === 409,
  });

  if (!holdAcquired || holdRes.status !== 200) {
      return;
  }

  const holdToken = holdRes.json('holdToken');

  // 4. Create Order
  const createOrderPayload = JSON.stringify({
      eventId: eventId,
      items: [{ categoryId: categoryId, quantity: 1 }],
      holdToken: holdToken,
      customerDetails: {
          firstName: 'Load',
          lastName: 'Test',
          email: `${userId}@example.com`,
          phone: '1234567890'
      }
  });

  const orderRes = http.post(`${ORDER_URL}/orders`, createOrderPayload, {
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
  });

  const orderCreated = check(orderRes, {
      'order created': (r) => r.status === 201,
  });

  if (!orderCreated) {
      return;
  }

  const orderId = orderRes.json('data.orderId');

  // 5. Process Payment
  const paymentPayload = JSON.stringify({
      orderId: orderId,
      amount: 1500000, // Mock amount
      currency: 'IDR',
      paymentMethod: 'credit_card'
  });

  const paymentRes = http.post(`${PAYMENT_URL}/payments`, paymentPayload, {
      headers: { 'Content-Type': 'application/json' },
  });

  check(paymentRes, {
      'payment processed': (r) => r.status === 200,
  });
}
