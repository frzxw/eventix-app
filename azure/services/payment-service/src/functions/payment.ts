import { app } from '@azure/functions';
import { processPaymentHandler } from '../handlers/processPayment';
import { initTelemetry } from '../utils/telemetry';

initTelemetry();

app.http('processPayment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'payments',
  handler: processPaymentHandler,
});
