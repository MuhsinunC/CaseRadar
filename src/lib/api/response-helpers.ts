/**
 * API Response Helpers
 * Standardized response formatting for API routes
 */

import { NextResponse } from 'next/server';
import type {
  ApiError,
  ApiResponse,
  PaginationMeta,
  PaginationParams,
} from './types';

/**
 * Create a successful JSON response
 */
export function successResponse<T>(
  data: T,
  options?: {
    status?: number;
    pagination?: PaginationMeta;
    headers?: Record<string, string>;
  }
): NextResponse<ApiResponse<T>> {
  const response: ApiResponse<T> = {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...(options?.pagination && { pagination: options.pagination }),
    },
  };

  return NextResponse.json(response, {
    status: options?.status ?? 200,
    headers: options?.headers,
  });
}

/**
 * Create an error JSON response
 */
export function errorResponse(
  error: string,
  options?: {
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
    headers?: Record<string, string>;
  }
): NextResponse<ApiError> {
  const response: ApiError = {
    error,
    ...(options?.code && { code: options.code }),
    ...(options?.details && { details: options.details }),
  };

  return NextResponse.json(response, {
    status: options?.status ?? 500,
    headers: options?.headers,
  });
}

/**
 * Standard error responses
 */
export const ApiErrors = {
  unauthorized: () =>
    errorResponse('Unauthorized', { status: 401, code: 'UNAUTHORIZED' }),

  forbidden: () =>
    errorResponse('Forbidden', { status: 403, code: 'FORBIDDEN' }),

  notFound: (resource = 'Resource') =>
    errorResponse(`${resource} not found`, { status: 404, code: 'NOT_FOUND' }),

  badRequest: (message = 'Bad request', details?: Record<string, unknown>) =>
    errorResponse(message, { status: 400, code: 'BAD_REQUEST', details }),

  validationError: (details: Record<string, string>) =>
    errorResponse('Validation failed', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details,
    }),

  internalError: (message = 'Internal server error') =>
    errorResponse(message, { status: 500, code: 'INTERNAL_ERROR' }),

  rateLimited: () =>
    errorResponse('Rate limit exceeded', {
      status: 429,
      code: 'RATE_LIMITED',
    }),
};

/**
 * Parse pagination parameters from URL search params
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaults?: Partial<PaginationParams>
): PaginationParams {
  const page = Math.max(
    1,
    parseInt(searchParams.get('page') ?? '') || defaults?.page || 1
  );
  const limit = Math.min(
    100,
    Math.max(
      1,
      parseInt(searchParams.get('limit') ?? '') || defaults?.limit || 20
    )
  );

  return { page, limit };
}

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  total: number,
  params: PaginationParams
): PaginationMeta {
  const totalPages = Math.ceil(total / params.limit);
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages,
    hasMore: params.page < totalPages,
  };
}

/**
 * Parse sort parameters from URL search params
 */
export function parseSortParams(
  searchParams: URLSearchParams,
  allowedFields: string[],
  defaults?: { field: string; order: 'asc' | 'desc' }
): { field: string; order: 'asc' | 'desc' } | undefined {
  const sortBy = searchParams.get('sortBy');
  const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' | null;

  if (sortBy && allowedFields.includes(sortBy)) {
    return {
      field: sortBy,
      order: sortOrder === 'desc' ? 'desc' : 'asc',
    };
  }

  return defaults;
}

/**
 * Parse date parameter from URL search params
 */
export function parseDateParam(
  searchParams: URLSearchParams,
  key: string
): Date | undefined {
  const value = searchParams.get(key);
  if (!value) return undefined;

  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Parse boolean parameter from URL search params
 */
export function parseBooleanParam(
  searchParams: URLSearchParams,
  key: string
): boolean | undefined {
  const value = searchParams.get(key);
  if (value === null) return undefined;
  return value === 'true' || value === '1';
}

/**
 * Parse number parameter from URL search params
 */
export function parseNumberParam(
  searchParams: URLSearchParams,
  key: string
): number | undefined {
  const value = searchParams.get(key);
  if (value === null) return undefined;

  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Wrap an async handler with error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T>>,
  context?: string
): Promise<NextResponse<T | ApiError>> {
  return handler().catch((error) => {
    console.error(`[API Error]${context ? ` ${context}:` : ''}`, error);
    return ApiErrors.internalError();
  });
}
