/**
 * Audit Logging
 * Security audit trail for compliance and monitoring
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type AuditAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'EXPORT'
  | 'IMPORT'
  | 'PERMISSION_CHANGE';

export type AuditResource =
  | 'USER'
  | 'ORGANIZATION'
  | 'COMPLAINT'
  | 'PATTERN'
  | 'GENERATED_COMPLAINT'
  | 'AUTH'
  | 'BILLING'
  | 'SETTINGS';

export interface AuditLogEntry {
  userId: string | null;
  organizationId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilter {
  organizationId: string;
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface AuditLogResult {
  logs: Array<{
    id: string;
    userId: string | null;
    organizationId: string | null;
    action: string;
    resource: string;
    resourceId: string | null;
    metadata: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>;
  total: number;
}

// Sensitive fields that should be redacted in audit logs
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'creditCard',
  'credit_card',
  'ssn',
  'socialSecurityNumber',
];

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry) {
  const filteredMetadata = entry.metadata
    ? filterSensitiveData(entry.metadata)
    : undefined;

  return prisma.auditLog.create({
    data: {
      userId: entry.userId ?? undefined,
      organizationId: entry.organizationId ?? undefined,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? undefined,
      metadata: filteredMetadata as Prisma.InputJsonValue | undefined,
      ipAddress: entry.ipAddress ?? undefined,
      userAgent: entry.userAgent ?? undefined,
      createdAt: new Date(),
    },
  });
}

/**
 * Get audit logs with filtering and pagination
 */
export async function getAuditLogs(
  filter: AuditLogFilter
): Promise<AuditLogResult> {
  const {
    organizationId,
    userId,
    action,
    resource,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = filter;

  const where: Record<string, unknown> = {
    organizationId,
  };

  if (userId) {
    where.userId = userId;
  }

  if (action) {
    where.action = action;
  }

  if (resource) {
    where.resource = resource;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      (where.createdAt as Record<string, Date>).gte = startDate;
    }
    if (endDate) {
      (where.createdAt as Record<string, Date>).lte = endDate;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Format an audit entry for display
 */
export function formatAuditEntry(entry: {
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  userId: string;
  createdAt: Date;
}): string {
  const actionVerbs: Record<AuditAction, string> = {
    CREATE: 'created',
    READ: 'viewed',
    UPDATE: 'updated',
    DELETE: 'deleted',
    LOGIN: 'logged in',
    LOGOUT: 'logged out',
    LOGIN_FAILED: 'failed to log in',
    EXPORT: 'exported',
    IMPORT: 'imported',
    PERMISSION_CHANGE: 'changed permissions for',
  };

  const verb = actionVerbs[entry.action] || entry.action.toLowerCase();
  const timestamp = entry.createdAt.toISOString();

  if (entry.action === 'LOGIN' || entry.action === 'LOGOUT' || entry.action === 'LOGIN_FAILED') {
    return `User ${entry.userId} ${verb} at ${timestamp}`;
  }

  return `User ${entry.userId} ${verb} ${entry.resource}${entry.resourceId ? ` (${entry.resourceId})` : ''} at ${timestamp}`;
}

/**
 * Filter sensitive data from objects before logging
 */
export function filterSensitiveData<T extends Record<string, unknown>>(
  data: T
): T {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Check if this is a sensitive field
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      filtered[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively filter nested objects
      filtered[key] = filterSensitiveData(value as Record<string, unknown>);
    } else {
      filtered[key] = value;
    }
  }

  return filtered as T;
}

/**
 * Create a middleware function for automatic audit logging
 */
export function createAuditMiddleware(options: {
  resource: AuditResource;
  action: AuditAction;
}) {
  return async function auditMiddleware(
    userId: string,
    organizationId: string,
    resourceId: string | null,
    metadata?: Record<string, unknown>,
    request?: { ip?: string; headers?: { 'user-agent'?: string } }
  ) {
    await createAuditLog({
      userId,
      organizationId,
      action: options.action,
      resource: options.resource,
      resourceId,
      metadata,
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent'],
    });
  };
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  event: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED',
  userId: string | null,
  metadata?: Record<string, unknown>,
  ipAddress?: string
) {
  return createAuditLog({
    userId,
    organizationId: null,
    action: event,
    resource: 'AUTH',
    resourceId: null,
    metadata,
    ipAddress,
  });
}

/**
 * Log data access events
 */
export async function logDataAccess(
  userId: string,
  organizationId: string,
  resource: AuditResource,
  resourceId: string,
  action: 'READ' | 'EXPORT' = 'READ'
) {
  return createAuditLog({
    userId,
    organizationId,
    action,
    resource,
    resourceId,
  });
}

/**
 * Log data modification events
 */
export async function logDataModification(
  userId: string,
  organizationId: string,
  resource: AuditResource,
  resourceId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  changes?: { before?: unknown; after?: unknown }
) {
  return createAuditLog({
    userId,
    organizationId,
    action,
    resource,
    resourceId,
    metadata: changes,
  });
}
