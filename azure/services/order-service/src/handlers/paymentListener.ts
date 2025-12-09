import { InvocationContext } from '@azure/functions';
import * as orderRepo from '../utils/orderRepository';
import { publishToTopic } from '../utils/serviceBus';

type PaymentConfirmedMessage = {
  orderId: string;
  paymentReference: string;
  paidAt: string;
};

function normalizeMessage(message: unknown): PaymentConfirmedMessage | null {
    if (typeof message === 'object' && message !== null) {
        return message as PaymentConfirmedMessage;
    }
    return null;
}

export async function paymentConfirmedHandler(message: unknown, context: InvocationContext): Promise<void> {
  const payload = normalizeMessage(message);
  if (!payload?.orderId) {
    context.log('PaymentConfirmed: skipping invalid message');
    return;
  }

  context.log(`PaymentConfirmed: processing order ${payload.orderId}`);

  try {
    const order = await orderRepo.findOrderById(payload.orderId);
    if (!order) {
      context.error(`PaymentConfirmed: order ${payload.orderId} not found`);
      return;
    }

    if (order.status === 'confirmed') {
      context.log(`PaymentConfirmed: order ${payload.orderId} already confirmed`);
      return;
    }

    // Update Order Status
    const updatedOrder = await orderRepo.updateOrder(order.id, {
      status: 'confirmed',
      paymentStatus: 'completed',
      paymentReference: payload.paymentReference,
      paidAt: new Date(payload.paidAt),
      expiresAt: null, // Clear expiry
    });

    // Publish Order Paid Event
    await publishToTopic('order-paid', {
      orderId: updatedOrder.id,
      eventId: updatedOrder.event_id,
      userId: updatedOrder.user_id,
      holdToken: updatedOrder.hold_token,
      paymentReference: updatedOrder.payment_reference,
    }, 'OrderPaid', updatedOrder.event_id);

    context.log(`PaymentConfirmed: order ${payload.orderId} confirmed`);

  } catch (error) {
    context.error('PaymentConfirmed: failed', error);
    throw error;
  }
}
