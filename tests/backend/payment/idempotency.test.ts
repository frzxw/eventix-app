import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkIdempotency, saveIdempotencyResult } from '../../../azure/services/payment-service/src/utils/idempotency';
import { containers } from '../../../azure/services/payment-service/src/utils/cosmos';

// Mock Cosmos DB
vi.mock('../../../azure/services/payment-service/src/utils/cosmos', () => ({
  containers: {
    idempotency: {
      item: vi.fn().mockReturnThis(),
      read: vi.fn(),
      patch: vi.fn(), // Mock patch
      items: {
        create: vi.fn(),
        upsert: vi.fn(),
      }
    }
  }
}));

describe('Payment Service - Idempotency', () => {
  const mockKey = 'idemp-123';
  const mockRecord = { 
    id: mockKey, 
    idempotencyKey: mockKey,
    status: 'completed',
    responseStatus: 200,
    responseBody: { paymentId: 'pay-123' },
    createdAt: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if key does not exist', async () => {
    (containers.idempotency.item as any).mockReturnValue({
      read: vi.fn().mockResolvedValue({ resource: null })
    });

    const result = await checkIdempotency(mockKey);
    expect(result).toBeNull();
  });

  it('should return stored record if key exists', async () => {
    (containers.idempotency.item as any).mockReturnValue({
      read: vi.fn().mockResolvedValue({ 
        resource: mockRecord
      })
    });

    const result = await checkIdempotency(mockKey);
    expect(result).toEqual(mockRecord);
  });

  it('should save idempotency result using patch', async () => {
    const mockPatch = vi.fn();
    (containers.idempotency.item as any).mockReturnValue({
      patch: mockPatch
    });

    await saveIdempotencyResult(mockKey, 'completed', 200, { paymentId: 'pay-123' });

    expect(mockPatch).toHaveBeenCalledWith(expect.arrayContaining([
      { op: 'set', path: '/status', value: 'completed' },
      { op: 'set', path: '/responseStatus', value: 200 },
      { op: 'set', path: '/responseBody', value: { paymentId: 'pay-123' } }
    ]));
  });
});
