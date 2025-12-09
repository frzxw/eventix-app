import { HttpRequest, HttpResponseInit } from '@azure/functions';
import * as orderRepo from '../utils/orderRepository';
import { ok, notFound, fail } from '../utils/response';

export async function getOrderHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const orderId = req.params.orderId;
    if (!orderId) return notFound('Order ID required');

    const order = await orderRepo.findOrderById(orderId);
    if (!order) return notFound('Order not found');

    const items = await orderRepo.findOrderItemsByOrderId(orderId);

    return ok({
      ...order,
      items,
    });
  } catch (error: any) {
    return fail(error.message);
  }
}

export async function getMyOrdersHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const userId = req.headers.get('x-user-id') || 'mock-user-id';
    const orders = await orderRepo.findOrdersByUserId(userId);
    return ok(orders);
  } catch (error: any) {
    return fail(error.message);
  }
}
