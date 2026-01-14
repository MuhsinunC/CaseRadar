/**
 * PII Detection & Redaction
 * P1-7 Implementation
 *
 * Provides utilities for detecting and redacting Personally
 * Identifiable Information (PII) in text, particularly AI outputs.
 */

/**
 * Types of PII that can be detected
 */
export enum PIIType {
  SSN = 'SSN',
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
  CREDIT_CARD = 'CREDIT_CARD',
  VIN = 'VIN',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  ADDRESS = 'ADDRESS',
}

/**
 * A match of PII in text
 */
export interface PIIMatch {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Regular expression patterns for each PII type
 * All patterns use global flag for finding all matches
 */
const PII_PATTERNS: Record<PIIType, RegExp> = {
  // SSN: XXX-XX-XXXX format
  [PIIType.SSN]: /\b\d{3}-\d{2}-\d{4}\b/g,

  // Phone: Various US formats including (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX
  [PIIType.PHONE]:
    /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,

  // Email: Standard email format
  [PIIType.EMAIL]: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

  // Credit Card: XXXX-XXXX-XXXX-XXXX or XXXX XXXX XXXX XXXX
  [PIIType.CREDIT_CARD]: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  // VIN: 17 alphanumeric characters (excluding I, O, Q)
  [PIIType.VIN]: /\b[A-HJ-NPR-Z0-9]{17}\b/g,

  // Driver's License: Various state formats (simplified pattern)
  [PIIType.DRIVERS_LICENSE]: /\b[A-Z]\d{3}[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/gi,

  // Address: Not implemented with regex (too complex, would need NLP)
  [PIIType.ADDRESS]: /(?!)/g, // Never matches
};

/**
 * Detect all PII in the given text
 *
 * @param text - Text to scan for PII
 * @returns Array of PII matches found
 */
export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        type: type as PIIType,
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  // Sort by startIndex for consistent ordering
  return matches.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Redact all PII from the given text
 * Replaces PII with [REDACTED {TYPE}] placeholders
 *
 * @param text - Text to redact PII from
 * @returns Text with PII replaced by placeholders
 */
export function redactPII(text: string): string {
  const matches = detectPII(text);

  if (matches.length === 0) {
    return text;
  }

  // Process matches from end to start to preserve indices
  const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

  let result = text;
  for (const match of sortedMatches) {
    const replacement = `[REDACTED ${match.type}]`;
    result =
      result.slice(0, match.startIndex) +
      replacement +
      result.slice(match.endIndex);
  }

  return result;
}

/**
 * Check if text contains any PII
 *
 * @param text - Text to check
 * @returns True if PII is detected
 */
export function hasPII(text: string): boolean {
  return detectPII(text).length > 0;
}

/**
 * Get unique list of PII types found in text
 *
 * @param text - Text to scan
 * @returns Array of unique PII types found
 */
export function getPIITypes(text: string): PIIType[] {
  const matches = detectPII(text);
  const types = new Set(matches.map((m) => m.type));
  return Array.from(types);
}

/**
 * Check if text contains specific PII type
 *
 * @param text - Text to check
 * @param type - PII type to look for
 * @returns True if specified PII type is found
 */
export function containsPIIType(text: string, type: PIIType): boolean {
  const matches = detectPII(text);
  return matches.some((m) => m.type === type);
}

/**
 * Get a summary of PII findings for logging/reporting
 *
 * @param text - Text to scan
 * @returns Summary object with counts per type
 */
export function getPIISummary(text: string): Record<PIIType, number> {
  const matches = detectPII(text);
  const summary: Partial<Record<PIIType, number>> = {};

  for (const match of matches) {
    summary[match.type] = (summary[match.type] || 0) + 1;
  }

  // Return full record with zeros for missing types
  return Object.values(PIIType).reduce(
    (acc, type) => {
      acc[type] = summary[type] || 0;
      return acc;
    },
    {} as Record<PIIType, number>
  );
}

/**
 * Partially redact PII (show last 4 characters)
 * Useful for display purposes where some context is helpful
 *
 * @param text - Text to partially redact
 * @returns Text with PII partially redacted
 */
export function partialRedactPII(text: string): string {
  const matches = detectPII(text);

  if (matches.length === 0) {
    return text;
  }

  // Process matches from end to start
  const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

  let result = text;
  for (const match of sortedMatches) {
    const value = match.value;
    const lastFour = value.slice(-4);
    const masked = '****'.repeat(Math.ceil((value.length - 4) / 4)) + lastFour;
    result =
      result.slice(0, match.startIndex) + masked + result.slice(match.endIndex);
  }

  return result;
}
