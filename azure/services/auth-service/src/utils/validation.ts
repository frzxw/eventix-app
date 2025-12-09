import { HttpRequest } from '@azure/functions';
import { z } from 'zod';

export async function readJsonBody<T>(req: HttpRequest): Promise<T | undefined> {
  try {
    return (await req.json()) as T;
  } catch {
    return undefined;
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.') || 'body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

export const ticketSelectionSchema = z.object({
  categoryId: z.string().min(1, 'categoryId is required'),
  quantity: z
    .number({ required_error: 'quantity is required' })
    .int('quantity must be an integer')
    .positive('quantity must be greater than zero'),
}).strict();
