/**
 * Data Masking for Logs
 * P3-7 Implementation
 *
 * Provides PII masking in text and sensitive field masking in objects.
 * Defense in depth for log security.
 */

/**
 * PII patterns for text masking
 */
const PII_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
  },
  // SSN (must be before phone to avoid conflicts)
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN]',
  },
  // Credit card numbers with dashes or spaces
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CREDIT_CARD]',
  },
  // Phone numbers (various formats)
  {
    pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE]',
  },
  // IP addresses (IPv4)
  {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_ADDRESS]',
  },
];

/**
 * Default sensitive field patterns
 */
export const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  /^password$/i,
  /passwd/i,
  /secret/i,
  /^token$/i,
  /token$/i, // authToken, accessToken, etc.
  /apikey/i,
  /api_key/i,
  /api-key/i,
  /key$/i,
  /^authorization$/i,
  /credential$/i, // Match only fields ending in 'credential'
  /bearer/i,
  /jwt/i,
  /^session$/i,
  /^cookie$/i,
  /^ssn$/i,
  /social.*security/i,
  /credit.*card/i,
  /card.*number/i,
  /cvv/i,
  /cvc/i,
  /^pin$/i,
  /private.*key/i,
  /clerk.*id/i,
  /accesstoken/i,
  /access_token/i,
  /refreshtoken/i,
  /refresh_token/i,
];

/**
 * Custom patterns added at runtime
 */
const customPatterns: RegExp[] = [];

/**
 * Mask PII in text
 *
 * @param text - Text to mask
 * @returns Text with PII masked
 */
export function maskPII(text: string): string {
  if (!text) {
    return text;
  }

  let masked = text;

  for (const { pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, replacement);
  }

  return masked;
}

/**
 * Check if a field name matches sensitive patterns
 *
 * @param fieldName - Field name to check
 * @returns True if field is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const allPatterns = [...SENSITIVE_FIELD_PATTERNS, ...customPatterns];

  for (const pattern of allPatterns) {
    if (pattern.test(fieldName)) {
      return true;
    }
  }

  return false;
}

/**
 * Mask sensitive fields in an object
 *
 * @param obj - Object to mask
 * @param redactedValue - Value to use for redacted fields
 * @returns Object with sensitive fields masked
 */
export function maskSensitiveFields<T>(
  obj: T,
  redactedValue: string = '[REDACTED]'
): T {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveFields(item, redactedValue)) as T;
  }

  // Handle objects
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveField(key)) {
      result[key] = redactedValue;
    } else if (value !== null && typeof value === 'object') {
      result[key] = maskSensitiveFields(value, redactedValue);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Add a custom sensitive pattern
 *
 * @param pattern - Regex pattern to add
 */
export function addSensitivePattern(pattern: RegExp): void {
  customPatterns.push(pattern);
}

/**
 * Clear custom patterns (for testing)
 */
export function clearCustomPatterns(): void {
  customPatterns.length = 0;
}

/**
 * Mask a log message (combines PII and field masking)
 *
 * @param message - Log message
 * @param context - Optional context object
 * @returns Masked log message and context
 */
export function maskLogMessage(
  message: string,
  context?: Record<string, unknown>
): { message: string; context?: Record<string, unknown> } {
  return {
    message: maskPII(message),
    context: context ? maskSensitiveFields(context) : undefined,
  };
}

/**
 * Create a safe logger wrapper
 *
 * @param logger - Logger instance
 * @returns Wrapped logger with masking
 */
export function createSafeLogger<
  T extends { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
>(logger: T): T {
  return {
    ...logger,
    info: (...args: unknown[]) => {
      const maskedArgs = args.map((arg) => {
        if (typeof arg === 'string') {
          return maskPII(arg);
        }
        if (typeof arg === 'object' && arg !== null) {
          return maskSensitiveFields(arg);
        }
        return arg;
      });
      logger.info(...maskedArgs);
    },
    error: (...args: unknown[]) => {
      const maskedArgs = args.map((arg) => {
        if (typeof arg === 'string') {
          return maskPII(arg);
        }
        if (typeof arg === 'object' && arg !== null) {
          return maskSensitiveFields(arg);
        }
        return arg;
      });
      logger.error(...maskedArgs);
    },
  };
}
