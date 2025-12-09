import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBookingStateMachine } from '../../../src/lib/hooks/useBookingStateMachine';
import { apiClient, bookings } from '../../../src/lib/services/api-client';
import { bookingQueueClient } from '../../../src/lib/services/bookingQueueClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock dependencies
vi.mock('../../../src/lib/services/api-client', () => ({
  apiClient: {
    bookings: {
      create: vi.fn()
    }
  },
  bookings: {
    create: vi.fn()
  }
}));

vi.mock('../../../src/lib/services/bookingQueueClient', () => ({
  bookingQueueClient: {
    joinQueue: vi.fn(),
    getQueueStatus: vi.fn().mockResolvedValue({ status: 'queued', position: 10, etaSeconds: 60 }),
    attemptHold: vi.fn(),
    subscribeToQueue: vi.fn(() => ({ stop: vi.fn(), isRealtime: false })),
  }
}));

// Mock Azure Monitoring
vi.mock('../../../src/lib/services/azure-monitoring', () => ({
  azureMonitoring: {
    trackEvent: vi.fn(),
    trackException: vi.fn(),
  }
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
};

describe('useBookingStateMachine', () => {
  const mockEventId = 'evt-123';
  const mockSelections = [{ categoryId: 'cat-1', quantity: 2 }];

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('should initialize in idle state', () => {
    const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });
    expect(result.current.state.stage).toBe('idle');
  });

  it('should transition to trying-hold when start is called', async () => {
    const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

    // Mock successful hold
    (bookingQueueClient.attemptHold as any).mockResolvedValue({
      status: 'acquired',
      holdToken: 'token-123',
      holdId: 'hold-123',
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      correlationId: 'corr-123'
    });

    await act(async () => {
      await result.current.actions.start({ eventId: mockEventId, selections: mockSelections });
    });

    expect(result.current.state.stage).toBe('ready-with-hold');
    expect(result.current.state.holdToken).toBe('token-123');
  });

  it('should transition to in-queue when hold returns queue_required', async () => {
    const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

    // Mock queue required
    (bookingQueueClient.attemptHold as any).mockResolvedValue({
      status: 'queued',
      queueId: 'q-123',
      position: 10,
      etaSeconds: 60,
      correlationId: 'corr-123'
    });

    // Mock join queue
    (bookingQueueClient.joinQueue as any).mockResolvedValue({
      status: 'queued',
      queueId: 'q-123',
      position: 10,
      etaSeconds: 60,
      correlationId: 'corr-123'
    });

    await act(async () => {
      await result.current.actions.start({ eventId: mockEventId, selections: mockSelections });
    });

    expect(result.current.state.stage).toBe('in-queue');
    expect(result.current.state.queuePosition).toBe(10);
  });

  it('should handle checkout success', async () => {
    const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

    // Setup state as ready-with-hold
    (bookingQueueClient.attemptHold as any).mockResolvedValue({
      status: 'acquired',
      holdToken: 'token-123',
      holdId: 'hold-123',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      correlationId: 'corr-123'
    });

    await act(async () => {
      await result.current.actions.start({ eventId: mockEventId, selections: mockSelections });
    });

    // Mock checkout
    (bookings.create as any).mockResolvedValue({
      data: { orderId: 'ord-123' },
      status: 201
    });

    const payload = {
      eventId: mockEventId,
      attendee: { firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '123' },
      selections: mockSelections,
      paymentMethod: 'card'
    };

    let checkoutResult;
    await act(async () => {
      checkoutResult = await result.current.actions.checkout(payload);
    });

    expect(checkoutResult).toEqual({ success: true, orderId: 'ord-123' });
  });
});
