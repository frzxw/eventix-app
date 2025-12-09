import { app } from '@azure/functions';
import { attemptHoldHandler, extendHoldHandler } from '../handlers/holds';
import {
  joinQueueHandler,
  getQueueStatusHandler,
  leaveQueueHandler,
  claimQueueHoldHandler,
} from '../handlers/queue';
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

app.http('joinQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'queue/join',
  handler: joinQueueHandler,
});

app.http('getQueueStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'queue/status/{queueId}',
  handler: getQueueStatusHandler,
});

app.http('leaveQueue', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'queue/leave/{queueId}',
  handler: leaveQueueHandler,
});

app.http('claimQueueHold', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'queue/claim',
  handler: claimQueueHoldHandler,
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
