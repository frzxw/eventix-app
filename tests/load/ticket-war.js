import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { Counter, Trend } from 'k6/metrics';

// Custom Metrics to track business outcomes
const successfulOrders = new Counter('successful_orders');
const soldOutErrors = new Counter('sold_out_errors');
const queueWaitTime = new Trend('queue_wait_time');
const queueJoinFailures = new Counter('queue_join_failures');

export const options = {
  scenarios: {
    coldplay_rush: {
      // Use ramping-arrival-rate to simulate users clicking "Join" at a specific rate
      // This is more realistic than fixed VUs for a "ticket drop" scenario
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 3000, // High max VUs because users will be stuck in "wait" loops
      stages: [
        { duration: '10s', target: 5 },   // Warmup: Early birds
        { duration: '30s', target: 40 },  // THE DROP: Spike to 40 users/sec joining
        { duration: '3m', target: 40 },   // Sustain: Constant pressure
        { duration: '30s', target: 0 },   // Cooldown
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'], // Allow higher latency during the rush
    http_req_failed: ['rate<0.10'],    // Allow up to 10% technical failures
    successful_orders: ['count>0'],    // Ensure we actually sold something
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:7073/api'; // Inventory Service URL
const ORDER_URL = __ENV.ORDER_URL || 'http://localhost:7074/api';
const PAYMENT_URL = __ENV.PAYMENT_URL || 'http://localhost:7075/api';

export default function () {
  const eventId = 'evt-001';
  const categoryId = 'cat-001-1';
  const userId = `user-${randomString(8)}`;
  
  // Headers with simulated IP to avoid rate limiting issues on localhost
  const headers = { 
      'Content-Type': 'application/json',
      'X-Forwarded-For': `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  };

  // 0. Think Time: User refreshing the page right before the drop
  sleep(Math.random() * 2);

  // 1. Join Queue
  const joinPayload = JSON.stringify({
    eventId: eventId,
    selections: [{ categoryId: categoryId, quantity: 1 }],
    requesterId: userId
  });
  
  const joinRes = http.post(`${BASE_URL}/queue/join`, joinPayload, { headers });
  
  const joined = check(joinRes, {
    'joined queue': (r) => r.status === 200,
  });
  
  if (!joined) {
      queueJoinFailures.add(1);
      console.log(`Join failed: ${joinRes.status} ${joinRes.body}`);
      return;
  }
  
  const queueId = joinRes.json('queueId');
  const joinStartTime = Date.now();
  
  // 2. Poll Status with Backoff and Jitter
  let ready = false;
  let attempts = 0;
  const maxAttempts = 60; 
  
  while (!ready && attempts < maxAttempts) {
      // Realistic polling: Not everyone polls exactly every 1s.
      // Add jitter and slight backoff to simulate client-side polling logic or user refreshing.
      // Sleep between 2s and 5s
      const pollInterval = 2 + Math.random() * 3;
      sleep(pollInterval);

      const statusRes = http.get(`${BASE_URL}/queue/status/${queueId}`, { headers });
      
      if (statusRes.status === 200) {
          const status = statusRes.json('status');
          if (status === 'ready') {
              ready = true;
          } else if (status === 'expired' || status === 'rejected') {
              return; // Kicked out of queue
          }
      }
      attempts++;
  }
  
  if (!ready) {
      // User gave up or timed out
      return;
  }

  // 2.5 Claim Queue Spot (Important to free up the queue for others!)
  const claimPayload = JSON.stringify({
      queueId: queueId
  });
  
  const claimRes = http.post(`${BASE_URL}/queue/claim`, claimPayload, { headers });
  
  const claimed = check(claimRes, {
      'queue claimed': (r) => r.status === 200,
  });
  
  if (!claimed) {
      console.log(`Claim failed: ${claimRes.status} ${claimRes.body}`);
      return;
  }

  // Track how long they waited
  queueWaitTime.add(Date.now() - joinStartTime);
  
  // 3. Attempt Hold
  // Think Time: User sees "It's your turn!" and reacts
  sleep(Math.random() * 2 + 1);

  const holdPayload = JSON.stringify({
    eventId: eventId,
    selections: [{ categoryId: categoryId, quantity: 1 }],
    requesterId: userId,
  });
  
  const holdRes = http.post(`${BASE_URL}/holds`, holdPayload, { headers });
  
  const holdStatus = holdRes.status;
  const holdProcessed = check(holdRes, {
      'hold processed (200 or 409)': (r) => r.status === 200 || r.status === 409,
  });

  if (!holdProcessed) {
      console.log(`Hold error: ${holdRes.status} ${holdRes.body}`);
      return;
  }

  if (holdStatus === 409) {
      soldOutErrors.add(1);
      return;
  }

  const holdToken = holdRes.json('holdToken');

  // 4. Create Order
  // Think Time: User filling out contact details form (Realistic: 10-20s)
  sleep(Math.random() * 10 + 10);

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
      headers: { ...headers, 'x-user-id': userId },
  });

  const orderCreated = check(orderRes, {
      'order created': (r) => r.status === 201,
  });

  if (!orderCreated) {
      console.log(`Order creation failed: ${orderRes.status} ${orderRes.body}`);
      return;
  }

  const orderId = orderRes.json('data.orderId');

  // 5. Process Payment
  // Think Time: User entering bank details / OTP (Realistic: 15-30s)
  sleep(Math.random() * 15 + 15);

  const paymentPayload = JSON.stringify({
      orderId: orderId,
      amount: 1500000, // Mock amount
      currency: 'IDR',
      paymentMethod: 'bank_transfer'
  });

  const paymentRes = http.post(`${PAYMENT_URL}/payments`, paymentPayload, {
      headers: { 
        ...headers,
        'idempotency-key': randomString(12)
      },
  });

  const paymentSuccess = check(paymentRes, {
      'payment processed': (r) => r.status === 200,
  });

  if (paymentSuccess) {
      successfulOrders.add(1);
  } else {
      console.log(`Payment failed: ${paymentRes.status} ${paymentRes.body}`);
  }
}
