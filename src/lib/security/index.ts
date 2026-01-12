/**
 * Security Module
 * Centralized security utilities for CaseRadar
 */

// Security Headers
export {
  getSecurityHeaders,
  getCSPHeader,
  validateSecurityHeaders,
  getNextSecurityHeaders,
  type SecurityHeaders,
  type CSPOptions,
  type ValidationResult,
} from './security-headers';

// Input Sanitization
export {
  sanitizeHtml,
  sanitizeString,
  validateInput,
  escapeForSql,
  sanitizeSearchQuery,
  sanitizeFilename,
  escapeHtml,
  sanitizeObject,
  type ValidationType,
  type SqlEscapeOptions,
  type SearchQueryOptions,
} from './input-sanitization';

// Audit Logging
export {
  createAuditLog,
  getAuditLogs,
  formatAuditEntry,
  filterSensitiveData,
  createAuditMiddleware,
  logAuthEvent,
  logDataAccess,
  logDataModification,
  type AuditAction,
  type AuditResource,
  type AuditLogEntry,
  type AuditLogFilter,
  type AuditLogResult,
} from './audit-logging';
