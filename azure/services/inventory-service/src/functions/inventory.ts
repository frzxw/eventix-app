import { app } from '@azure/functions';
import { attemptHoldHandler, extendHoldHandler } from '../handlers/holds';
import { capacitySyncHandler } from '../handlers/capacitySync';
import { reservationExpiryHandler } from '../handlers/reservationExpiry';
import { redisCleanupHandler } from '../handlers/redisCleanup';
import { initTelemetry } from '../utils/telemetry';

initTelemetry();

// HTTP Triggers
app.http('attemptHold', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'holds',
  handler: attemptHoldHandler,
});

app.http('extendHold', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'holds/extend',
  handler: extendHoldHandler,
});

// Service Bus Trigger
app.serviceBusQueue('capacitySync', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: 'capacity-sync',
  handler: capacitySyncHandler,
});

// Timer Triggers
app.timer('reservationExpiry', {
  schedule: '0 */1 * * * *', // Every minute
  handler: reservationExpiryHandler,
});

app.timer('redisCleanup', {
  schedule: '0 */1 * * * *', // Every minute
  handler: redisCleanupHandler,
});
