import { app } from '@azure/functions';
import { processPaymentHandler } from '../handlers/processPayment';
import { paymentListenerHandler } from '../handlers/paymentListener';
import { initTelemetry } from '../utils/telemetry';

initTelemetry();

app.http('processPayment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'payments',
  handler: processPaymentHandler,
});

app.serviceBusTopic('paymentListener', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  topicName: 'order-events',
  subscriptionName: 'payment-service',
  handler: paymentListenerHandler,
});
