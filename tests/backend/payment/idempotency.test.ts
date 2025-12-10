import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { checkIdempotency, saveIdempotencyResult } from '../../../azure/services/payment-service/src/utils/idempotency';
import { getDb, sql } from '../../../azure/services/payment-service/src/utils/db';

vi.mock('../../../azure/services/payment-service/src/utils/db', () => ({
  getDb: vi.fn(),
  sql: {
    NVarChar: 'NVarChar',
    Int: 'Int'
  }
}));

describe('Payment Service - Idempotency', () => {
  const mockKey = 'idemp-123';
  const mockRecord = { 
    id: mockKey, 
    status: 'completed',
    responseStatus: 200,
    responseBody: JSON.stringify({ paymentId: 'pay-123' }),
    createdAt: new Date()
  };

  const mockRequest = {
    input: vi.fn().mockReturnThis(),
    query: vi.fn()
  };

  const mockPool = {
    request: vi.fn().mockReturnValue(mockRequest)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getDb as Mock).mockResolvedValue(mockPool);
  });

  it('should return null if key does not exist', async () => {
    mockRequest.query.mockResolvedValue({ recordset: [] });

    const result = await checkIdempotency(mockKey);
    expect(result).toBeNull();
  });

  it('should return stored record if key exists', async () => {
    mockRequest.query.mockResolvedValue({ recordset: [mockRecord] });

    const result = await checkIdempotency(mockKey);
    expect(result).toEqual({
        ...mockRecord,
        responseBody: JSON.parse(mockRecord.responseBody)
    });
  });

  it('should save idempotency result', async () => {
    mockRequest.query.mockResolvedValue({ rowsAffected: [1] });

    await saveIdempotencyResult(mockKey, 'completed', 200, { paymentId: 'pay-123' });

    expect(mockRequest.input).toHaveBeenCalledWith('id', sql.NVarChar, mockKey);
    expect(mockRequest.input).toHaveBeenCalledWith('status', sql.NVarChar, 'completed');
    expect(mockRequest.query).toHaveBeenCalled();
  });
});


