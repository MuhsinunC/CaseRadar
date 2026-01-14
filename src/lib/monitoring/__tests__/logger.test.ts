/**
 * Structured JSON Logger Tests
 * P2-1 Implementation - TDD
 *
 * Tests for structured JSON logging with request context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createRequestLogger, LogLevel } from '../logger';

describe('Structured Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset log level
    delete process.env.LOG_LEVEL;
  });

  describe('Log Format', () => {
    it('should output JSON format', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Test message');

      const output = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should include timestamp', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Test');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.timestamp).toBeDefined();
      expect(new Date(log.timestamp)).toBeInstanceOf(Date);
      expect(isNaN(new Date(log.timestamp).getTime())).toBe(false);
    });

    it('should include log level', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('Warning');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.level).toBe('WARN');
    });

    it('should include message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Test message');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.message).toBe('Test message');
    });

    it('should include service name', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Test');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.service).toBe('caseradar');
    });
  });

  describe('Request Context', () => {
    it('should include requestId when set', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const reqLogger = createRequestLogger('req-123');

      reqLogger.info('Request log');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.requestId).toBe('req-123');
    });

    it('should include userId when available', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const reqLogger = createRequestLogger('req-123', { userId: 'user-456' });

      reqLogger.info('User action');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.userId).toBe('user-456');
    });

    it('should include organizationId when available', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const reqLogger = createRequestLogger('req-123', {
        userId: 'user-456',
        organizationId: 'org-789',
      });

      reqLogger.info('Org action');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.organizationId).toBe('org-789');
    });

    it('should preserve context across multiple calls', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const reqLogger = createRequestLogger('req-123', {
        userId: 'user-456',
      });

      reqLogger.info('First');
      reqLogger.info('Second');

      const log1 = JSON.parse(consoleSpy.mock.calls[0][0]);
      const log2 = JSON.parse(consoleSpy.mock.calls[1][0]);

      expect(log1.requestId).toBe('req-123');
      expect(log2.requestId).toBe('req-123');
      expect(log1.userId).toBe('user-456');
      expect(log2.userId).toBe('user-456');
    });
  });

  describe('Log Levels', () => {
    it('should support ERROR level', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      logger.error('Error message', { error: new Error('Test') });

      expect(consoleSpy).toHaveBeenCalled();
      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.level).toBe('ERROR');
      expect(log.error).toBeDefined();
    });

    it('should support WARN level', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('Warning');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.level).toBe('WARN');
    });

    it('should support INFO level', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Info');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.level).toBe('INFO');
    });

    it('should support DEBUG level when LOG_LEVEL is DEBUG', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      logger.debug('Debug');

      expect(consoleSpy).toHaveBeenCalled();
      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.level).toBe('DEBUG');
    });

    it('should not output DEBUG when LOG_LEVEL is INFO', () => {
      process.env.LOG_LEVEL = 'INFO';
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      logger.debug('Debug');

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error Serialization', () => {
    it('should serialize Error objects', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const testError = new Error('Test error');
      testError.stack = 'Error: Test error\n    at Test.fn';

      logger.error('Failed', { error: testError });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.error).toEqual({
        name: 'Error',
        message: 'Test error',
        stack: 'Error: Test error\n    at Test.fn',
      });
    });

    it('should handle custom error types', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const customError = new CustomError('Custom message');
      logger.error('Custom error', { error: customError });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.error.name).toBe('CustomError');
      expect(log.error.message).toBe('Custom message');
    });

    it('should handle error without stack', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const errorWithoutStack = new Error('No stack');
      delete errorWithoutStack.stack;

      logger.error('Error', { error: errorWithoutStack });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.error.stack).toBeUndefined();
    });
  });

  describe('Metadata', () => {
    it('should include custom metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('With metadata', {
        patternId: 'pattern-123',
        severity: 8.5,
      });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.patternId).toBe('pattern-123');
      expect(log.severity).toBe(8.5);
    });

    it('should handle nested metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Nested', {
        user: { id: '123', role: 'admin' },
      });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.user).toEqual({ id: '123', role: 'admin' });
    });

    it('should handle array metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Array', {
        ids: ['a', 'b', 'c'],
      });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.ids).toEqual(['a', 'b', 'c']);
    });

    it('should merge context with metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const reqLogger = createRequestLogger('req-123', { userId: 'user-456' });

      reqLogger.info('Merged', { extra: 'data' });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.requestId).toBe('req-123');
      expect(log.userId).toBe('user-456');
      expect(log.extra).toBe('data');
    });
  });

  describe('LogLevel Enum', () => {
    it('should export LogLevel enum', () => {
      expect(LogLevel.DEBUG).toBe('DEBUG');
      expect(LogLevel.INFO).toBe('INFO');
      expect(LogLevel.WARN).toBe('WARN');
      expect(LogLevel.ERROR).toBe('ERROR');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('');

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.message).toBe('');
    });

    it('should handle undefined metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('No meta', undefined);

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.message).toBe('No meta');
    });

    it('should handle null values in metadata', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('Null value', { value: null });

      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.value).toBeNull();
    });

    it('should handle special characters in message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const message = 'Test "quotes" and\nnewlines';
      logger.info(message);

      // Should not throw when parsing
      const log = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(log.message).toBe(message);
    });
  });
});
