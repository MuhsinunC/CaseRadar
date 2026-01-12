/**
 * Input Sanitization Tests
 * Tests for XSS prevention and input validation
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeString,
  validateInput,
  escapeForSql,
  sanitizeSearchQuery,
  sanitizeFilename,
  escapeHtml,
  sanitizeObject,
} from '../input-sanitization';

describe('Input Sanitization', () => {
  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const input = '<script>alert("XSS")</script>Hello';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      expect(result).toContain('Hello');
    });

    it('should remove onclick handlers', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
    });

    it('should remove javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('should remove onerror handlers', () => {
      const input = '<img src="x" onerror="alert(1)">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onerror');
    });

    it('should handle nested script attempts', () => {
      const input = '<<script>script>alert(1)<</script>/script>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('script');
    });

    it('should remove event handlers (on*)', () => {
      const handlers = ['onload', 'onmouseover', 'onfocus', 'onblur'];
      handlers.forEach((handler) => {
        const input = `<div ${handler}="alert(1)">test</div>`;
        const result = sanitizeHtml(input);
        expect(result).not.toContain(handler);
      });
    });

    it('should preserve safe content', () => {
      const input = 'Hello <b>World</b>';
      const result = sanitizeHtml(input);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      const input = '  hello world  ';
      const result = sanitizeString(input);
      expect(result).toBe('hello world');
    });

    it('should remove null bytes', () => {
      const input = 'hello\x00world';
      const result = sanitizeString(input);
      expect(result).toBe('helloworld');
    });

    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString('   ')).toBe('');
    });

    it('should normalize unicode', () => {
      const input = 'café';
      const result = sanitizeString(input);
      expect(result).toBe('café');
    });

    it('should remove control characters', () => {
      const input = 'hello\x01\x02\x03world';
      const result = sanitizeString(input);
      expect(result).toBe('helloworld');
    });
  });

  describe('validateInput', () => {
    it('should validate email format', () => {
      expect(validateInput('test@example.com', 'email')).toBe(true);
      expect(validateInput('invalid-email', 'email')).toBe(false);
      expect(validateInput('test@', 'email')).toBe(false);
    });

    it('should validate alphanumeric strings', () => {
      expect(validateInput('abc123', 'alphanumeric')).toBe(true);
      expect(validateInput('abc-123', 'alphanumeric')).toBe(false);
      expect(validateInput('abc 123', 'alphanumeric')).toBe(false);
    });

    it('should validate numbers', () => {
      expect(validateInput('123', 'number')).toBe(true);
      expect(validateInput('123.45', 'number')).toBe(true);
      expect(validateInput('abc', 'number')).toBe(false);
    });

    it('should validate UUIDs', () => {
      expect(validateInput('550e8400-e29b-41d4-a716-446655440000', 'uuid')).toBe(true);
      expect(validateInput('not-a-uuid', 'uuid')).toBe(false);
    });

    it('should validate URLs', () => {
      expect(validateInput('https://example.com', 'url')).toBe(true);
      expect(validateInput('http://example.com/path', 'url')).toBe(true);
      expect(validateInput('not-a-url', 'url')).toBe(false);
    });

    it('should validate dates', () => {
      expect(validateInput('2024-01-15', 'date')).toBe(true);
      expect(validateInput('01-15-2024', 'date')).toBe(false);
      expect(validateInput('not-a-date', 'date')).toBe(false);
    });
  });

  describe('escapeForSql', () => {
    it('should escape single quotes', () => {
      const input = "O'Brien";
      const result = escapeForSql(input);
      expect(result).toBe("O''Brien");
    });

    it('should escape backslashes', () => {
      const input = 'path\\to\\file';
      const result = escapeForSql(input);
      expect(result).toBe('path\\\\to\\\\file');
    });

    it('should handle SQL injection attempts', () => {
      const input = "'; DROP TABLE users; --";
      const result = escapeForSql(input);
      expect(result).not.toContain("';");
      expect(result).not.toContain('--');
    });

    it('should escape percent signs for LIKE queries', () => {
      const input = '100%';
      const result = escapeForSql(input, { forLike: true });
      expect(result).toBe('100\\%');
    });

    it('should escape underscores for LIKE queries', () => {
      const input = 'test_value';
      const result = escapeForSql(input, { forLike: true });
      expect(result).toBe('test\\_value');
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should remove dangerous characters', () => {
      const input = 'search; DROP TABLE';
      const result = sanitizeSearchQuery(input);
      expect(result).not.toContain(';');
    });

    it('should limit query length', () => {
      const input = 'a'.repeat(1000);
      const result = sanitizeSearchQuery(input, { maxLength: 100 });
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should preserve alphanumeric and spaces', () => {
      const input = 'Toyota Camry 2020';
      const result = sanitizeSearchQuery(input);
      expect(result).toBe('Toyota Camry 2020');
    });

    it('should remove special characters used in attacks', () => {
      const input = 'search<script>alert(1)</script>';
      const result = sanitizeSearchQuery(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path traversal characters', () => {
      const input = '../../../etc/passwd';
      const result = sanitizeFilename(input);
      expect(result).not.toContain('..');
      expect(result).not.toContain('/');
    });

    it('should remove backslashes', () => {
      const input = '..\\..\\file.txt';
      const result = sanitizeFilename(input);
      expect(result).not.toContain('\\');
    });

    it('should preserve valid filenames', () => {
      const input = 'document-2024.pdf';
      const result = sanitizeFilename(input);
      expect(result).toBe('document-2024.pdf');
    });

    it('should remove null bytes', () => {
      const input = 'file.txt\x00.exe';
      const result = sanitizeFilename(input);
      expect(result).not.toContain('\x00');
    });

    it('should handle empty filenames', () => {
      expect(sanitizeFilename('')).toBe('');
      expect(sanitizeFilename('...')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape angle brackets', () => {
      expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
      expect(escapeHtml("'single'")).toBe('&#39;single&#39;');
    });

    it('should escape forward slashes', () => {
      expect(escapeHtml('/path')).toBe('&#x2F;path');
    });

    it('should escape backticks', () => {
      expect(escapeHtml('`code`')).toBe('&#x60;code&#x60;');
    });

    it('should escape equals signs', () => {
      expect(escapeHtml('a=b')).toBe('a&#x3D;b');
    });

    it('should handle complex strings with multiple special chars', () => {
      const input = '<script>alert("XSS")</script>';
      const result = escapeHtml(input);
      expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values by removing control characters', () => {
      const input = { name: 'Test\x00Value' };
      const result = sanitizeObject(input);
      expect(result.name).not.toContain('\x00');
      expect(result.name).toBe('TestValue');
    });

    it('should recursively sanitize nested objects', () => {
      const input = {
        user: {
          name: ' John ',
          profile: {
            bio: 'Hello\x00World',
          },
        },
      };
      const result = sanitizeObject(input);
      expect(result.user.name).toBe('John');
      expect(result.user.profile.bio).toBe('HelloWorld');
    });

    it('should sanitize arrays of strings', () => {
      const input = {
        tags: [' safe ', 'normal', '\x00clean'],
      };
      const result = sanitizeObject(input);
      expect(result.tags[0]).toBe('safe');
      expect(result.tags[2]).toBe('clean');
    });

    it('should sanitize arrays of objects', () => {
      const input = {
        users: [
          { name: ' User1 ' },
          { name: 'User2\x00' },
        ],
      };
      const result = sanitizeObject(input);
      expect(result.users[0].name).toBe('User1');
      expect(result.users[1].name).toBe('User2');
    });

    it('should preserve non-string values', () => {
      const input = {
        count: 42,
        active: true,
        ratio: 3.14,
        empty: null,
      };
      const result = sanitizeObject(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.ratio).toBe(3.14);
      expect(result.empty).toBeNull();
    });

    it('should handle arrays with mixed types', () => {
      const input = {
        mixed: [' text ', 42, true, { nested: ' bold ' }],
      };
      const result = sanitizeObject(input);
      expect(result.mixed[0]).toBe('text');
      expect(result.mixed[1]).toBe(42);
      expect(result.mixed[2]).toBe(true);
      expect((result.mixed[3] as any).nested).toBe('bold');
    });
  });

  describe('validateInput - additional branches', () => {
    it('should return false for unknown validation type', () => {
      // @ts-expect-error Testing invalid type
      expect(validateInput('test', 'unknown_type')).toBe(false);
    });

    it('should validate url type', () => {
      expect(validateInput('https://example.com', 'url')).toBe(true);
      expect(validateInput('http://test.org/path', 'url')).toBe(true);
      expect(validateInput('not-a-url', 'url')).toBe(false);
    });

    it('should validate date type', () => {
      expect(validateInput('2024-01-15', 'date')).toBe(true);
      expect(validateInput('2024/01/15', 'date')).toBe(false);
      expect(validateInput('not-a-date', 'date')).toBe(false);
    });
  });

  describe('escapeForSql - additional branches', () => {
    it('should escape for LIKE queries', () => {
      const result = escapeForSql('100% match_test', { forLike: true });
      expect(result).toContain('\\%');
      expect(result).toContain('\\_');
    });
  });

  describe('sanitizeSearchQuery - additional branches', () => {
    it('should truncate to custom max length', () => {
      const longInput = 'a'.repeat(100);
      const result = sanitizeSearchQuery(longInput, { maxLength: 50 });
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should remove SQL comment patterns', () => {
      expect(sanitizeSearchQuery('test /* comment */ here')).not.toContain('/*');
      expect(sanitizeSearchQuery('test */ end')).not.toContain('*/');
    });
  });
});
