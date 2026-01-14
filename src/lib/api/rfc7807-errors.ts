/**
 * RFC 7807 Problem Details for HTTP APIs
 * https://datatracker.ietf.org/doc/html/rfc7807
 *
 * Provides standardized error responses for API endpoints.
 */

import { NextResponse } from 'next/server';

/**
 * RFC 7807 Problem Details interface
 */
export interface ProblemDetails {
  /** URI reference identifying the problem type */
  type: string;
  /** Short, human-readable summary of the problem */
  title: string;
  /** HTTP status code */
  status: number;
  /** Human-readable explanation specific to this occurrence */
  detail?: string;
  /** URI reference identifying the specific occurrence */
  instance?: string;
  /** Additional properties for extended information */
  [key: string]: unknown;
}

const ERROR_TYPE_BASE = 'https://api.caseradar.com/errors';

/**
 * Create an RFC 7807 compliant error response
 */
export function problemResponse(
  problem: ProblemDetails,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(problem, {
    status: problem.status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...headers,
    },
  });
}

/**
 * Standard RFC 7807 error builders
 */
export const Problems = {
  /**
   * 400 Bad Request - Invalid input from client
   */
  badRequest: (detail?: string, extensions?: Record<string, unknown>): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/bad-request`,
      title: 'Bad Request',
      status: 400,
      detail: detail ?? 'The request was invalid or malformed.',
      ...extensions,
    }),

  /**
   * 400 Validation Error - Request validation failed
   */
  validationError: (
    errors: Record<string, string | string[]>,
    detail?: string
  ): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/validation-error`,
      title: 'Validation Error',
      status: 400,
      detail: detail ?? 'One or more fields failed validation.',
      errors,
    }),

  /**
   * 401 Unauthorized - Authentication required
   */
  unauthorized: (detail?: string): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/unauthorized`,
      title: 'Unauthorized',
      status: 401,
      detail: detail ?? 'Authentication is required to access this resource.',
    }),

  /**
   * 403 Forbidden - Permission denied
   */
  forbidden: (detail?: string): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/forbidden`,
      title: 'Forbidden',
      status: 403,
      detail: detail ?? 'You do not have permission to access this resource.',
    }),

  /**
   * 404 Not Found - Resource doesn't exist
   */
  notFound: (resource?: string, detail?: string): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/not-found`,
      title: 'Not Found',
      status: 404,
      detail: detail ?? `The requested ${resource ?? 'resource'} was not found.`,
      resource,
    }),

  /**
   * 409 Conflict - Resource state conflict
   */
  conflict: (detail: string, extensions?: Record<string, unknown>): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/conflict`,
      title: 'Conflict',
      status: 409,
      detail,
      ...extensions,
    }),

  /**
   * 422 Unprocessable Entity - Semantic errors
   */
  unprocessableEntity: (detail: string, extensions?: Record<string, unknown>): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/unprocessable-entity`,
      title: 'Unprocessable Entity',
      status: 422,
      detail,
      ...extensions,
    }),

  /**
   * 429 Too Many Requests - Rate limit exceeded
   */
  rateLimited: (retryAfter: number, detail?: string): NextResponse =>
    problemResponse(
      {
        type: `${ERROR_TYPE_BASE}/rate-limited`,
        title: 'Too Many Requests',
        status: 429,
        detail: detail ?? `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
        retryAfter,
      },
      { 'Retry-After': String(retryAfter) }
    ),

  /**
   * 500 Internal Server Error - Unexpected server error
   */
  internalError: (detail?: string, instance?: string): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/internal-error`,
      title: 'Internal Server Error',
      status: 500,
      detail: detail ?? 'An unexpected error occurred. Please try again later.',
      instance,
    }),

  /**
   * 502 Bad Gateway - Upstream service error
   */
  badGateway: (service: string, detail?: string): NextResponse =>
    problemResponse({
      type: `${ERROR_TYPE_BASE}/bad-gateway`,
      title: 'Bad Gateway',
      status: 502,
      detail: detail ?? `The ${service} service is temporarily unavailable.`,
      service,
    }),

  /**
   * 503 Service Unavailable - Service temporarily unavailable
   */
  serviceUnavailable: (detail?: string, retryAfter?: number): NextResponse =>
    problemResponse(
      {
        type: `${ERROR_TYPE_BASE}/service-unavailable`,
        title: 'Service Unavailable',
        status: 503,
        detail: detail ?? 'The service is temporarily unavailable. Please try again later.',
        ...(retryAfter && { retryAfter }),
      },
      retryAfter ? { 'Retry-After': String(retryAfter) } : undefined
    ),

  /**
   * Custom problem response for specific use cases
   */
  custom: (
    type: string,
    title: string,
    status: number,
    detail?: string,
    extensions?: Record<string, unknown>
  ): NextResponse =>
    problemResponse({
      type: type.startsWith('http') ? type : `${ERROR_TYPE_BASE}/${type}`,
      title,
      status,
      detail,
      ...extensions,
    }),
};

/**
 * Extract error details from unknown error for logging/response
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  code?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      code: (error as Error & { code?: string }).code,
    };
  }
  return {
    message: String(error),
  };
}

/**
 * Wrap async handler with RFC 7807 error handling
 */
export function withProblemHandling<T>(
  handler: () => Promise<NextResponse<T>>,
  context?: string
): Promise<NextResponse<T | ProblemDetails>> {
  return handler().catch((error) => {
    const details = extractErrorDetails(error);
    console.error(`[API Error]${context ? ` ${context}:` : ''}`, details);

    // In development, include more details
    if (process.env.NODE_ENV === 'development') {
      return Problems.internalError(details.message);
    }

    return Problems.internalError();
  }) as Promise<NextResponse<T | ProblemDetails>>;
}
