/**
 * PII Detection & Redaction Tests
 * P1-7 Implementation - TDD
 *
 * Tests for PII (Personally Identifiable Information) detection
 * and redaction in AI-generated content.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPII,
  redactPII,
  PIIType,
  hasPII,
  getPIITypes,
} from '../pii-detection';

describe('PII Detection', () => {
  describe('detectPII', () => {
    it('should detect Social Security Numbers', () => {
      const text = 'Contact John Smith SSN 123-45-6789 for details';
      const results = detectPII(text);

      expect(results).toContainEqual({
        type: PIIType.SSN,
        value: '123-45-6789',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should detect SSN with different formats', () => {
      const text = 'SSN: 999-88-7777 and 111-22-3333';
      const results = detectPII(text);

      const ssnResults = results.filter((r) => r.type === PIIType.SSN);
      expect(ssnResults).toHaveLength(2);
    });

    it('should detect phone numbers', () => {
      const text = 'Call (555) 123-4567 for assistance';
      const results = detectPII(text);

      expect(results).toContainEqual({
        type: PIIType.PHONE,
        value: '(555) 123-4567',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should detect phone numbers with different formats', () => {
      const text = 'Call 555-123-4567 or 555.123.4567 or 5551234567';
      const results = detectPII(text);

      const phoneResults = results.filter((r) => r.type === PIIType.PHONE);
      expect(phoneResults.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect email addresses', () => {
      const text = 'Email john.doe@example.com for more info';
      const results = detectPII(text);

      expect(results).toContainEqual({
        type: PIIType.EMAIL,
        value: 'john.doe@example.com',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should detect email addresses with subdomains', () => {
      const text = 'Contact support@mail.company.co.uk';
      const results = detectPII(text);

      expect(results.some((r) => r.type === PIIType.EMAIL)).toBe(true);
    });

    it('should detect credit card numbers', () => {
      const text = 'Card number 4111-1111-1111-1111 was used';
      const results = detectPII(text);

      expect(results).toContainEqual({
        type: PIIType.CREDIT_CARD,
        value: '4111-1111-1111-1111',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should detect credit card numbers with spaces', () => {
      const text = 'Credit card: 4111 1111 1111 1111';
      const results = detectPII(text);

      expect(results.some((r) => r.type === PIIType.CREDIT_CARD)).toBe(true);
    });

    it('should detect VINs', () => {
      const text = 'VIN: 1HGCM82633A004352';
      const results = detectPII(text);

      expect(results).toContainEqual({
        type: PIIType.VIN,
        value: '1HGCM82633A004352',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should detect drivers license numbers', () => {
      const text = 'License D123-456-789-012';
      const results = detectPII(text);

      expect(results.some((r) => r.type === PIIType.DRIVERS_LICENSE)).toBe(
        true
      );
    });

    it('should return empty array for clean text', () => {
      const text = 'This text contains no personal information';
      const results = detectPII(text);

      expect(results).toHaveLength(0);
    });

    it('should detect multiple PII types in one text', () => {
      const text =
        'SSN: 123-45-6789, Email: test@example.com, Phone: 555-123-4567';
      const results = detectPII(text);

      const types = results.map((r) => r.type);
      expect(types).toContain(PIIType.SSN);
      expect(types).toContain(PIIType.EMAIL);
      expect(types).toContain(PIIType.PHONE);
    });

    it('should include correct indices for matches', () => {
      const text = 'Email test@example.com here';
      const results = detectPII(text);

      const emailMatch = results.find((r) => r.type === PIIType.EMAIL);
      expect(emailMatch).toBeDefined();
      expect(text.slice(emailMatch!.startIndex, emailMatch!.endIndex)).toBe(
        'test@example.com'
      );
    });
  });

  describe('redactPII', () => {
    it('should redact all detected PII', () => {
      const text = 'SSN: 123-45-6789, Email: test@example.com';
      const redacted = redactPII(text);

      expect(redacted).not.toContain('123-45-6789');
      expect(redacted).not.toContain('test@example.com');
      expect(redacted).toContain('[REDACTED SSN]');
      expect(redacted).toContain('[REDACTED EMAIL]');
    });

    it('should preserve non-PII text', () => {
      const text = 'Vehicle: 2021 Toyota Camry, SSN: 123-45-6789';
      const redacted = redactPII(text);

      expect(redacted).toContain('Vehicle: 2021 Toyota Camry');
    });

    it('should handle text with no PII', () => {
      const text = 'This is clean text with no PII';
      const redacted = redactPII(text);

      expect(redacted).toBe(text);
    });

    it('should redact phone numbers correctly', () => {
      const text = 'Call (555) 123-4567 for help';
      const redacted = redactPII(text);

      expect(redacted).toContain('[REDACTED PHONE]');
      expect(redacted).not.toContain('(555) 123-4567');
    });

    it('should redact credit cards correctly', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const redacted = redactPII(text);

      expect(redacted).toContain('[REDACTED CREDIT_CARD]');
      expect(redacted).not.toContain('4111');
    });

    it('should redact VINs correctly', () => {
      const text = 'VIN: 1HGCM82633A004352';
      const redacted = redactPII(text);

      expect(redacted).toContain('[REDACTED VIN]');
      expect(redacted).not.toContain('1HGCM82633A004352');
    });

    it('should handle multiple redactions correctly', () => {
      const text =
        'Email john@test.com, Phone 555-111-2222, SSN 111-22-3333';
      const redacted = redactPII(text);

      expect(redacted).toContain('[REDACTED EMAIL]');
      expect(redacted).toContain('[REDACTED PHONE]');
      expect(redacted).toContain('[REDACTED SSN]');
    });
  });

  describe('hasPII', () => {
    it('should return true if PII is present', () => {
      const text = 'SSN: 123-45-6789';
      expect(hasPII(text)).toBe(true);
    });

    it('should return false if no PII is present', () => {
      const text = 'This is clean text';
      expect(hasPII(text)).toBe(false);
    });
  });

  describe('getPIITypes', () => {
    it('should return list of detected PII types', () => {
      const text = 'SSN: 123-45-6789, Email: test@example.com';
      const types = getPIITypes(text);

      expect(types).toContain(PIIType.SSN);
      expect(types).toContain(PIIType.EMAIL);
    });

    it('should return empty array for clean text', () => {
      const text = 'No PII here';
      const types = getPIITypes(text);

      expect(types).toHaveLength(0);
    });

    it('should return unique types only', () => {
      const text =
        'SSN: 123-45-6789, another SSN: 111-22-3333';
      const types = getPIITypes(text);

      // Should only contain SSN once
      const ssnCount = types.filter((t) => t === PIIType.SSN).length;
      expect(ssnCount).toBe(1);
    });
  });
});
