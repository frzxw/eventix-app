import { app } from '@azure/functions';
import { createOrderHandler } from '../handlers/createOrder';
import { getOrderHandler, getMyOrdersHandler } from '../handlers/getOrder';
import { paymentConfirmedHandler } from '../handlers/paymentListener';
import { initTelemetry } from '../utils/telemetry';

initTelemetry();

// HTTP Triggers
app.http('createOrder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'orders',
  handler: createOrderHandler,
});

app.http('getOrder', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'orders/{orderId}',
  handler: getOrderHandler,
});

app.http('getMyOrders', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'my-orders',
  handler: getMyOrdersHandler,
});

// Service Bus Trigger
app.serviceBusQueue('paymentConfirmed', {
  connection: 'SERVICE_BUS_CONNECTION_STRING',
  queueName: '%SERVICE_BUS_FINALIZATION_QUEUE%',
  handler: paymentConfirmedHandler,
});
