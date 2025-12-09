/**
 * Frontend Booking Flow E2E Tests
 * Tests the complete user journey from event selection through checkout
 * Using Vitest and React Testing Library
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBookingStateMachine } from '@/lib/hooks/useBookingStateMachine';
import { bookingQueueClient } from '@/lib/services/bookingQueueClient';
import type { HoldAttemptResult, QueueStatus, HoldClaimResponse } from '@/lib/services/bookingQueueClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the booking queue client
vi.mock('@/lib/services/bookingQueueClient', () => ({
  bookingQueueClient: {
    attemptHold: vi.fn(),
    joinQueue: vi.fn(),
    getQueueStatus: vi.fn(),
    claimHold: vi.fn(),
    leaveQueue: vi.fn(),
    extendHold: vi.fn(),
    subscribeToQueue: vi.fn(),
  },
}));

// Mock Azure monitoring
vi.mock('@/lib/services/azure-monitoring', () => ({
  azureMonitoring: {
    trackEvent: vi.fn(),
    trackException: vi.fn(),
  },
}));

// Mock the bookings API client
vi.mock('@/lib/services/api-client', () => ({
  bookings: {
    create: vi.fn(),
  },
}));

const TEST_EVENT_ID = 'evt-e2e-test-' + Date.now();
const TEST_CATEGORY_ID = 'cat-e2e-test-' + Date.now();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Frontend Booking Flow E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Booking State Machine - Direct Hold Acquisition', () => {
    it('should initialize with idle state', () => {
      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      expect(result.current.state.stage).toBe('idle');
      expect(result.current.state.selections).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should transition to acquired hold when inventory available', async () => {
      const mockHoldResult: HoldAttemptResult = {
        status: 'acquired',
        holdId: 'hold-123',
        holdToken: 'token-abc',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        expiresInSeconds: 600,
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockHoldResult);

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 2 }],
        });
      });

      // Should immediately transition to ready-with-hold
      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      expect(result.current.state.holdId).toBe('hold-123');
      expect(result.current.state.holdToken).toBe('token-abc');
      expect(result.current.state.holdExpiresAt).toBe(mockHoldResult.expiresAt);
    });

    it('should preserve selections through hold acquisition', async () => {
      const selections = [{ categoryId: TEST_CATEGORY_ID, quantity: 3 }];
      const mockHoldResult: HoldAttemptResult = {
        status: 'acquired',
        holdId: 'hold-123',
        holdToken: 'token-abc',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockHoldResult);

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections,
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      expect(result.current.state.selections).toEqual(selections);
    });
  });

  describe('Booking State Machine - Queue Path', () => {
    it('should transition to in-queue when hold unavailable', async () => {
      const mockQueueResult: HoldAttemptResult = {
        status: 'queued',
        queueId: 'queue-123',
        position: 5,
        etaSeconds: 120,
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockQueueResult);
      (bookingQueueClient.subscribeToQueue as any).mockReturnValue({
        stop: vi.fn(),
        isRealtime: false,
      });

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('in-queue');
      });

      expect(result.current.state.queueId).toBe('queue-123');
      expect(result.current.state.queuePosition).toBe(5);
      expect(result.current.state.queueEtaSeconds).toBe(120);
    });

    it('should poll queue status periodically', async () => {
      const mockQueueResult: HoldAttemptResult = {
        status: 'queued',
        queueId: 'queue-123',
        position: 5,
        etaSeconds: 120,
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockQueueResult);
      (bookingQueueClient.getQueueStatus as any).mockResolvedValue({
        status: 'queued',
        queueId: 'queue-123',
        position: 4,
        etaSeconds: 100,
      });
      (bookingQueueClient.subscribeToQueue as any).mockReturnValue({
        stop: vi.fn(),
        isRealtime: false,
      });

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('in-queue');
      });

      // Wait for polling
      await waitFor(() => {
        expect(bookingQueueClient.getQueueStatus).toHaveBeenCalled();
      }, { timeout: 10000 });
    });

    it('should transition to ready-with-hold when queue signals ready', async () => {
      const mockQueueResult: HoldAttemptResult = {
        status: 'queued',
        queueId: 'queue-123',
        position: 5,
        etaSeconds: 120,
        correlationId: 'corr-test',
      };

      const mockReadyStatus: QueueStatus = {
        status: 'ready',
        queueId: 'queue-123',
        position: 0,
        etaSeconds: 0,
        holdToken: 'token-from-queue',
        holdId: 'hold-from-queue',
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockQueueResult);
      (bookingQueueClient.claimHold as any).mockResolvedValueOnce({
        success: true,
        holdToken: 'token-from-queue',
        holdId: 'hold-from-queue',
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
      });

      let queueStatusCallback: ((status: QueueStatus) => void) | null = null;
      (bookingQueueClient.subscribeToQueue as any).mockImplementation(
        (_queueId: string, callback: (status: QueueStatus) => void) => {
          queueStatusCallback = callback;
          return { stop: vi.fn(), isRealtime: false };
        }
      );

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('in-queue');
      });

      // Simulate queue becoming ready
      if (queueStatusCallback) {
        await act(async () => {
          queueStatusCallback!(mockReadyStatus);
        });
      }

      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      expect(result.current.state.holdToken).toBe('token-from-queue');
    });
  });

  describe('Hold Extension', () => {
    it('should extend hold before expiry', async () => {
      const mockHoldResult: HoldAttemptResult = {
        status: 'acquired',
        holdId: 'hold-123',
        holdToken: 'token-abc',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        expiresInSeconds: 600,
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockHoldResult);
      (bookingQueueClient.extendHold as any).mockResolvedValueOnce({
        success: true,
        holdToken: 'token-abc',
        holdExpiresAt: new Date(Date.now() + 1200000).toISOString(),
      });

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      const initialExpiry = result.current.state.holdExpiresAt;

      // Extend hold
      await act(async () => {
        await result.current.actions.extendHold();
      });

      await waitFor(() => {
        expect(result.current.state.holdExpiresAt).not.toBe(initialExpiry);
      });

      expect(bookingQueueClient.extendHold).toHaveBeenCalledWith('token-abc', expect.any(String));
    });
  });

  describe('Queue Cancellation', () => {
    it('should cancel queue and reset state', async () => {
      const mockQueueResult: HoldAttemptResult = {
        status: 'queued',
        queueId: 'queue-123',
        position: 5,
        etaSeconds: 120,
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockQueueResult);
      (bookingQueueClient.leaveQueue as any).mockResolvedValueOnce(true);
      (bookingQueueClient.subscribeToQueue as any).mockReturnValue({
        stop: vi.fn(),
        isRealtime: false,
      });

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('in-queue');
      });

      // Cancel queue
      await act(async () => {
        await result.current.actions.cancelQueue();
      });

      expect(result.current.state.stage).toBe('idle');
      expect(result.current.state.queueId).toBeUndefined();
      expect(bookingQueueClient.leaveQueue).toHaveBeenCalledWith('queue-123', expect.any(String));
    });
  });

  describe('Checkout Integration', () => {
    it('should prepare checkout with hold token', async () => {
      const mockHoldResult: HoldAttemptResult = {
        status: 'acquired',
        holdId: 'hold-123',
        holdToken: 'token-abc',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockHoldResult);

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 2 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      // State should be ready for checkout
      expect(result.current.state.eventId).toBe(TEST_EVENT_ID);
      expect(result.current.state.holdToken).toBe('token-abc');
      expect(result.current.state.selections).toEqual([
        { categoryId: TEST_CATEGORY_ID, quantity: 2 },
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle hold attempt rejection', async () => {
      const mockRejectResult: HoldAttemptResult = {
        status: 'rejected',
        reason: 'INSUFFICIENT_STOCK',
        detail: 'category:cat-123',
        retryable: true,
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockRejectResult);

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.startError).toBeDefined();
      });

      expect(result.current.state.stage).toBe('error');
    });

    it('should handle network errors gracefully', async () => {
      (bookingQueueClient.attemptHold as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.startError).toBeDefined();
      });
    });

    it('should handle hold expiration', async () => {
      const mockHoldResult: HoldAttemptResult = {
        status: 'acquired',
        holdId: 'hold-123',
        holdToken: 'token-abc',
        expiresAt: new Date(Date.now() + 1000).toISOString(), // Expires soon
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockHoldResult);

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      // Wait for expiration
      await waitFor(() => {
        expect(result.current.state.stage).toBe('expired');
      }, { timeout: 5000 });
    });
  });

  describe('Session Persistence', () => {
    it('should persist booking state to session storage', async () => {
      const mockHoldResult: HoldAttemptResult = {
        status: 'acquired',
        holdId: 'hold-123',
        holdToken: 'token-abc',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        correlationId: 'corr-test',
      };

      (bookingQueueClient.attemptHold as any).mockResolvedValueOnce(mockHoldResult);

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      await act(async () => {
        result.current.actions.start({
          eventId: TEST_EVENT_ID,
          selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        });
      });

      await waitFor(() => {
        expect(result.current.state.stage).toBe('ready-with-hold');
      });

      // Check session storage
      const stored = sessionStorage.getItem('eventix.booking.session');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.eventId).toBe(TEST_EVENT_ID);
      expect(parsed.holdToken).toBe('token-abc');
    });

    it('should restore state from session storage', async () => {
      const storedState = {
        stage: 'ready-with-hold',
        eventId: TEST_EVENT_ID,
        selections: [{ categoryId: TEST_CATEGORY_ID, quantity: 1 }],
        holdId: 'hold-123',
        holdToken: 'token-abc',
        holdExpiresAt: new Date(Date.now() + 600000).toISOString(),
        correlationId: 'corr-test',
        isRealtimeActive: false,
        lastUpdated: Date.now(),
      };

      sessionStorage.setItem('eventix.booking.session', JSON.stringify(storedState));

      const { result } = renderHook(() => useBookingStateMachine(), { wrapper: createWrapper() });

      // Should restore from storage
      expect(result.current.state.stage).toBe('ready-with-hold');
      expect(result.current.state.holdToken).toBe('token-abc');
      expect(result.current.state.selections).toEqual(storedState.selections);
    });
  });
});

