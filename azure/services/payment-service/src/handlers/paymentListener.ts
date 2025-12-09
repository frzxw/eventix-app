import type { InvocationContext } from '@azure/functions';
import { sendToFinalizationQueue } from '../utils/serviceBus';
import { trackEvent } from '../utils/telemetry';

interface OrderCreatedEvent {
  type: 'OrderCreated';
  data: {
    orderId: string;
    userId: string;
    eventId: string;
    totalAmount: number;
    currency: string;
    status: string;
    items: unknown[];
    expiresAt: string;
  };
  correlationId?: string;
}

export async function paymentListenerHandler(message: unknown, context: InvocationContext): Promise<void> {
  // In Azure Functions v4, message is the body if it's JSON
  const event = message as OrderCreatedEvent;

  if (event.type !== 'OrderCreated') {
    return;
  }

  const { orderId, eventId } = event.data;

  context.log(`Processing payment for order ${orderId}`);

  // Mock Payment Processing
  // Simulate some delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  const paymentReference = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const paidAt = new Date().toISOString();

  // Send to Finalization Queue
  await sendToFinalizationQueue({
    orderId,
    paymentReference,
    paidAt,
    eventId,
  });

  trackEvent('PaymentProcessed', { orderId, paymentReference });
  context.log(`Payment processed for order ${orderId}, ref: ${paymentReference}`);
}
