import { HttpRequest } from '@azure/functions';
import { z } from 'zod';

export async function readJsonBody<T>(req: HttpRequest): Promise<T | undefined> {
  try {
    const body = await req.json();
    return body as T;
  } catch (e) {
    console.error('Failed to parse JSON body:', e);
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
  quantity: z.any(), // Relaxed for debugging
});
