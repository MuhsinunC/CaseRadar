/**
 * Data Masking for Logs Tests
 * P3-7 Implementation - TDD
 *
 * Tests for PII masking in text and sensitive field masking in objects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  maskPII,
  maskSensitiveFields,
  SENSITIVE_FIELD_PATTERNS,
  addSensitivePattern,
  clearCustomPatterns,
} from '../data-masking';

describe('Data Masking', () => {
  describe('maskPII', () => {
    it('should mask email addresses', () => {
      const text = 'Contact john.doe@example.com for help';
      const masked = maskPII(text);

      expect(masked).not.toContain('john.doe@example.com');
      expect(masked).toContain('[EMAIL]');
    });

    it('should mask multiple email addresses', () => {
      const text = 'Email jane@test.com or bob.smith@company.org';
      const masked = maskPII(text);

      expect(masked).not.toContain('jane@test.com');
      expect(masked).not.toContain('bob.smith@company.org');
      expect(masked.match(/\[EMAIL\]/g)?.length).toBe(2);
    });

    it('should mask phone numbers', () => {
      const text = 'Call (555) 123-4567';
      const masked = maskPII(text);

      expect(masked).not.toContain('(555) 123-4567');
      expect(masked).toContain('[PHONE]');
    });

    it('should mask various phone formats', () => {
      const formats = [
        '555-123-4567',
        '555.123.4567',
        '5551234567',
        '+1 555-123-4567',
        '1-555-123-4567',
      ];

      for (const phone of formats) {
        const masked = maskPII(`Call ${phone}`);
        expect(masked).toContain('[PHONE]');
      }
    });

    it('should mask SSNs', () => {
      const text = 'SSN: 123-45-6789';
      const masked = maskPII(text);

      expect(masked).not.toContain('123-45-6789');
      expect(masked).toContain('[SSN]');
    });

    it('should mask credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const masked = maskPII(text);

      expect(masked).not.toContain('4111-1111-1111-1111');
      expect(masked).toContain('[CREDIT_CARD]');
    });

    it('should mask credit card numbers without dashes', () => {
      const text = 'Card: 4111111111111111';
      const masked = maskPII(text);

      expect(masked).not.toContain('4111111111111111');
      expect(masked).toContain('[CREDIT_CARD]');
    });

    it('should mask IP addresses', () => {
      const text = 'Request from 192.168.1.100';
      const masked = maskPII(text);

      expect(masked).not.toContain('192.168.1.100');
      expect(masked).toContain('[IP_ADDRESS]');
    });

    it('should preserve non-PII text', () => {
      const text = 'User created pattern with severity 8.5';
      const masked = maskPII(text);

      expect(masked).toBe(text);
    });

    it('should handle empty string', () => {
      expect(maskPII('')).toBe('');
    });

    it('should handle text with no PII', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      expect(maskPII(text)).toBe(text);
    });

    it('should mask mixed PII types', () => {
      const text = 'User john@test.com from 192.168.1.1 called 555-123-4567';
      const masked = maskPII(text);

      expect(masked).toContain('[EMAIL]');
      expect(masked).toContain('[IP_ADDRESS]');
      expect(masked).toContain('[PHONE]');
    });
  });

  describe('maskSensitiveFields', () => {
    it('should mask password fields', () => {
      const obj = { username: 'john', password: 'secret123' };
      const masked = maskSensitiveFields(obj);

      expect(masked.username).toBe('john');
      expect(masked.password).toBe('[REDACTED]');
    });

    it('should mask apiKey fields', () => {
      const obj = { name: 'app', apiKey: 'sk-1234567890' };
      const masked = maskSensitiveFields(obj);

      expect(masked.name).toBe('app');
      expect(masked.apiKey).toBe('[REDACTED]');
    });

    it('should mask token fields', () => {
      const obj = { userId: '123', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' };
      const masked = maskSensitiveFields(obj);

      expect(masked.userId).toBe('123');
      expect(masked.token).toBe('[REDACTED]');
    });

    it('should mask secret fields', () => {
      const obj = { id: 1, clientSecret: 'supersecret' };
      const masked = maskSensitiveFields(obj);

      expect(masked.id).toBe(1);
      expect(masked.clientSecret).toBe('[REDACTED]');
    });

    it('should mask nested sensitive fields', () => {
      const obj = {
        user: {
          name: 'John',
          credentials: {
            apiKey: 'sk-123456',
            token: 'eyJhbGc...',
          },
        },
      };
      const masked = maskSensitiveFields(obj);

      expect(masked.user.name).toBe('John');
      expect(masked.user.credentials.apiKey).toBe('[REDACTED]');
      expect(masked.user.credentials.token).toBe('[REDACTED]');
    });

    it('should mask fields matching patterns', () => {
      const obj = { clerkUserId: 'user_123', publicName: 'John' };
      const masked = maskSensitiveFields(obj);

      expect(masked.clerkUserId).toBe('[REDACTED]');
      expect(masked.publicName).toBe('John');
    });

    it('should mask accessToken fields', () => {
      const obj = { accessToken: 'abc123', refreshToken: 'def456' };
      const masked = maskSensitiveFields(obj);

      expect(masked.accessToken).toBe('[REDACTED]');
      expect(masked.refreshToken).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const obj = {
        users: [
          { name: 'John', password: 'pass1' },
          { name: 'Jane', password: 'pass2' },
        ],
      };
      const masked = maskSensitiveFields(obj);

      expect(masked.users[0].name).toBe('John');
      expect(masked.users[0].password).toBe('[REDACTED]');
      expect(masked.users[1].name).toBe('Jane');
      expect(masked.users[1].password).toBe('[REDACTED]');
    });

    it('should handle empty objects', () => {
      expect(maskSensitiveFields({})).toEqual({});
    });

    it('should handle null', () => {
      expect(maskSensitiveFields(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(maskSensitiveFields(undefined)).toBeUndefined();
    });

    it('should preserve primitive types', () => {
      expect(maskSensitiveFields('string' as unknown)).toBe('string');
      expect(maskSensitiveFields(123 as unknown)).toBe(123);
      expect(maskSensitiveFields(true as unknown)).toBe(true);
    });

    it('should not mutate original object', () => {
      const original = { password: 'secret' };
      const masked = maskSensitiveFields(original);

      expect(original.password).toBe('secret');
      expect(masked.password).toBe('[REDACTED]');
    });

    it('should mask deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              apiKey: 'secret-key',
            },
          },
        },
      };
      const masked = maskSensitiveFields(obj);

      expect(masked.level1.level2.level3.apiKey).toBe('[REDACTED]');
    });

    it('should mask authorization headers', () => {
      const obj = {
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };
      const masked = maskSensitiveFields(obj);

      expect(masked.headers.authorization).toBe('[REDACTED]');
      expect(masked.headers['content-type']).toBe('application/json');
    });
  });

  describe('SENSITIVE_FIELD_PATTERNS', () => {
    it('should include common sensitive field names', () => {
      const patterns = SENSITIVE_FIELD_PATTERNS.map((p) => p.toString());

      expect(patterns.some((p) => p.includes('password'))).toBe(true);
      expect(patterns.some((p) => p.includes('secret'))).toBe(true);
      expect(patterns.some((p) => p.includes('token'))).toBe(true);
      expect(patterns.some((p) => p.includes('key'))).toBe(true);
      expect(patterns.some((p) => p.includes('credential'))).toBe(true);
    });

    it('should match case-insensitively', () => {
      const obj = {
        PASSWORD: 'secret1',
        ApiKey: 'secret2',
        authToken: 'secret3',
      };
      const masked = maskSensitiveFields(obj);

      expect(masked.PASSWORD).toBe('[REDACTED]');
      expect(masked.ApiKey).toBe('[REDACTED]');
      expect(masked.authToken).toBe('[REDACTED]');
    });
  });

  describe('Custom patterns', () => {
    beforeEach(() => {
      clearCustomPatterns();
    });

    afterEach(() => {
      clearCustomPatterns();
    });

    it('should allow adding custom patterns', () => {
      addSensitivePattern(/customField/i);

      const obj = { customField: 'sensitive', normalField: 'visible' };
      const masked = maskSensitiveFields(obj);

      expect(masked.customField).toBe('[REDACTED]');
      expect(masked.normalField).toBe('visible');
    });

    it('should combine custom patterns with default patterns', () => {
      addSensitivePattern(/mySecret/i);

      const obj = { password: 'pass1', mySecret: 'value' };
      const masked = maskSensitiveFields(obj);

      expect(masked.password).toBe('[REDACTED]');
      expect(masked.mySecret).toBe('[REDACTED]');
    });
  });
});
