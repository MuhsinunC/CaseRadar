/**
 * Input Sanitization
 * XSS prevention, SQL injection defense, and input validation
 */

export type ValidationType =
  | 'email'
  | 'alphanumeric'
  | 'number'
  | 'uuid'
  | 'url'
  | 'date';

export interface SqlEscapeOptions {
  forLike?: boolean;
}

export interface SearchQueryOptions {
  maxLength?: number;
}

// Patterns for dangerous HTML content
const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_PATTERN = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URL_PATTERN = /javascript\s*:/gi;
const NESTED_SCRIPT_PATTERN = /<+\s*s+c+r+i+p+t+/gi;

// Validation patterns
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALPHANUMERIC_PATTERN = /^[a-zA-Z0-9]+$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Control characters to remove (excluding common whitespace)
const CONTROL_CHARS_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  let sanitized = input;

  // Remove script tags (including nested/malformed attempts)
  sanitized = sanitized.replace(SCRIPT_PATTERN, '');
  sanitized = sanitized.replace(NESTED_SCRIPT_PATTERN, '');

  // Remove event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(EVENT_HANDLER_PATTERN, '');

  // Remove javascript: URLs
  sanitized = sanitized.replace(JAVASCRIPT_URL_PATTERN, '');

  // Remove any remaining "script" text that might be part of obfuscation
  sanitized = sanitized.replace(/script/gi, '');

  return sanitized;
}

/**
 * Sanitize a string by removing control characters and trimming
 */
export function sanitizeString(input: string): string {
  if (!input) return '';

  // Remove null bytes and control characters
  let sanitized = input.replace(CONTROL_CHARS_PATTERN, '');

  // Normalize unicode
  sanitized = sanitized.normalize('NFC');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Validate input against a specific type pattern
 */
export function validateInput(input: string, type: ValidationType): boolean {
  switch (type) {
    case 'email':
      return EMAIL_PATTERN.test(input);
    case 'alphanumeric':
      return ALPHANUMERIC_PATTERN.test(input);
    case 'number':
      return NUMBER_PATTERN.test(input);
    case 'uuid':
      return UUID_PATTERN.test(input);
    case 'url':
      return URL_PATTERN.test(input);
    case 'date':
      return DATE_PATTERN.test(input);
    default:
      return false;
  }
}

/**
 * Escape string for safe SQL usage (defense in depth - always use parameterized queries)
 */
export function escapeForSql(
  input: string,
  options: SqlEscapeOptions = {}
): string {
  let escaped = input;

  // Escape single quotes by doubling them
  escaped = escaped.replace(/'/g, "''");

  // Escape backslashes
  escaped = escaped.replace(/\\/g, '\\\\');

  // Remove SQL comment indicators
  escaped = escaped.replace(/--/g, '');

  // Remove semicolons that could terminate statements
  escaped = escaped.replace(/;/g, '');

  // For LIKE queries, escape special characters
  if (options.forLike) {
    escaped = escaped.replace(/%/g, '\\%');
    escaped = escaped.replace(/_/g, '\\_');
  }

  return escaped;
}

/**
 * Sanitize a search query for safe use
 */
export function sanitizeSearchQuery(
  input: string,
  options: SearchQueryOptions = {}
): string {
  const { maxLength = 500 } = options;

  let sanitized = input;

  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>;"'(){}[\]\\]/g, '');

  // Remove potential SQL injection patterns
  sanitized = sanitized.replace(/;/g, '');
  sanitized = sanitized.replace(/--/g, '');
  sanitized = sanitized.replace(/\/\*/g, '');
  sanitized = sanitized.replace(/\*\//g, '');

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized.trim();
}

/**
 * Sanitize a filename to prevent path traversal attacks
 */
export function sanitizeFilename(input: string): string {
  if (!input) return '';

  let sanitized = input;

  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');

  // Remove path traversal sequences
  sanitized = sanitized.replace(/\.\./g, '');

  // Remove forward and back slashes
  sanitized = sanitized.replace(/[/\\]/g, '');

  // Remove leading/trailing dots
  sanitized = sanitized.replace(/^\.+|\.+$/g, '');

  // Only allow safe characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');

  return sanitized;
}

/**
 * Escape HTML entities to prevent XSS in text content
 */
export function escapeHtml(input: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return input.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Validate and sanitize an object recursively
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string'
          ? sanitizeString(item)
          : typeof item === 'object' && item !== null
            ? sanitizeObject(item as Record<string, unknown>)
            : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
