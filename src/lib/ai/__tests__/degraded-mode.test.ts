/**
 * Degraded Mode Tests
 * P1-9 Implementation - TDD
 *
 * Tests for graceful degradation when AI services are unavailable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDegradedMode,
  setDegradedMode,
  getDegradedReason,
  clearDegradedMode,
  withDegradedFallback,
  getDegradedState,
} from '../degraded-mode';

describe('Degraded Mode', () => {
  beforeEach(() => {
    // Clear degraded mode before each test
    clearDegradedMode();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isDegradedMode', () => {
    it('should return false when all services healthy', () => {
      expect(isDegradedMode()).toBe(false);
    });

    it('should return true when degraded mode is set', () => {
      setDegradedMode(true, 'OpenAI API unavailable');
      expect(isDegradedMode()).toBe(true);
    });

    it('should return false after clearing degraded mode', () => {
      setDegradedMode(true, 'Test');
      clearDegradedMode();
      expect(isDegradedMode()).toBe(false);
    });
  });

  describe('getDegradedReason', () => {
    it('should return null when not degraded', () => {
      expect(getDegradedReason()).toBeNull();
    });

    it('should return reason for degraded mode', () => {
      setDegradedMode(true, 'Anthropic rate limited');
      expect(getDegradedReason()).toBe('Anthropic rate limited');
    });

    it('should update reason when set multiple times', () => {
      setDegradedMode(true, 'First reason');
      setDegradedMode(true, 'Second reason');
      expect(getDegradedReason()).toBe('Second reason');
    });
  });

  describe('getDegradedState', () => {
    it('should return full state object', () => {
      const state = getDegradedState();
      expect(state).toHaveProperty('isDegraded');
      expect(state).toHaveProperty('reason');
      expect(state).toHaveProperty('since');
    });

    it('should include timestamp when degraded', () => {
      const before = Date.now();
      setDegradedMode(true, 'Test');
      const state = getDegradedState();

      expect(state.since).toBeDefined();
      expect(state.since).toBeGreaterThanOrEqual(before);
    });

    it('should have null since when not degraded', () => {
      const state = getDegradedState();
      expect(state.since).toBeNull();
    });
  });

  describe('setDegradedMode', () => {
    it('should enable degraded mode with reason', () => {
      setDegradedMode(true, 'Service unavailable');

      expect(isDegradedMode()).toBe(true);
      expect(getDegradedReason()).toBe('Service unavailable');
    });

    it('should disable degraded mode when set to false', () => {
      setDegradedMode(true, 'Test');
      setDegradedMode(false);

      expect(isDegradedMode()).toBe(false);
      expect(getDegradedReason()).toBeNull();
    });

    it('should preserve timestamp when updating reason', () => {
      setDegradedMode(true, 'First');
      const state1 = getDegradedState();

      setDegradedMode(true, 'Second');
      const state2 = getDegradedState();

      // Timestamp should not change when just updating reason
      expect(state2.since).toBe(state1.since);
    });
  });

  describe('withDegradedFallback', () => {
    it('should use primary function when not degraded', async () => {
      const primary = vi.fn().mockResolvedValue('primary result');
      const fallback = vi.fn().mockResolvedValue('fallback result');

      const result = await withDegradedFallback(primary, fallback);

      expect(result).toBe('primary result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback when degraded', async () => {
      setDegradedMode(true, 'Test');

      const primary = vi.fn().mockResolvedValue('primary result');
      const fallback = vi.fn().mockResolvedValue('fallback result');

      const result = await withDegradedFallback(primary, fallback);

      expect(result).toBe('fallback result');
      expect(primary).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('should switch to fallback on primary error', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('API Error'));
      const fallback = vi.fn().mockResolvedValue('fallback result');

      const result = await withDegradedFallback(primary, fallback);

      expect(result).toBe('fallback result');
      expect(isDegradedMode()).toBe(true);
      expect(getDegradedReason()).toContain('API Error');
    });

    it('should pass through args to primary and fallback', async () => {
      const primary = vi.fn().mockResolvedValue('result');
      const fallback = vi.fn().mockResolvedValue('result');

      await withDegradedFallback(
        () => primary('arg1', 'arg2'),
        () => fallback('arg1', 'arg2')
      );

      expect(primary).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should throw if both primary and fallback fail', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(withDegradedFallback(primary, fallback)).rejects.toThrow(
        'Fallback failed'
      );
    });

    it('should include context in fallback call when provided', async () => {
      setDegradedMode(true, 'Test');

      const primary = vi.fn();
      const fallback = vi.fn().mockResolvedValue('result');

      await withDegradedFallback(primary, fallback, { operation: 'generate' });

      expect(fallback).toHaveBeenCalledWith({ operation: 'generate' });
    });
  });

  describe('Auto-recovery', () => {
    it('should track time since degraded', () => {
      vi.useFakeTimers();
      const startTime = Date.now();

      setDegradedMode(true, 'Test');

      vi.advanceTimersByTime(60000); // 1 minute

      const state = getDegradedState();
      expect(state.since).toBe(startTime);
    });

    it('should clear state on recovery', () => {
      setDegradedMode(true, 'Test');
      expect(isDegradedMode()).toBe(true);

      clearDegradedMode();

      const state = getDegradedState();
      expect(state.isDegraded).toBe(false);
      expect(state.reason).toBeNull();
      expect(state.since).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty reason', () => {
      setDegradedMode(true, '');
      expect(isDegradedMode()).toBe(true);
      expect(getDegradedReason()).toBe('');
    });

    it('should handle undefined reason as null', () => {
      setDegradedMode(true);
      expect(getDegradedReason()).toBe('Unknown reason');
    });

    it('should handle rapid state changes', () => {
      for (let i = 0; i < 100; i++) {
        setDegradedMode(i % 2 === 0, `Reason ${i}`);
      }

      // Last iteration (i=99) sets it to true
      expect(isDegradedMode()).toBe(false);
    });
  });
});
