/**
 * Cursor-Based Pagination Utility
 * Based on architecture documentation: docs/architecture/02-api-routes.md
 *
 * Provides consistent cursor-based pagination across all list endpoints.
 */

/**
 * Pagination parameters from request
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction: 'forward' | 'backward';
}

/**
 * Pagination response structure
 */
export interface CursorPaginationResponse {
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
}

/**
 * Parse cursor pagination parameters from URL search params
 */
export function parseCursorParams(searchParams: URLSearchParams): CursorPaginationParams {
  const cursor = searchParams.get('cursor') || undefined;
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || '20', 10), 1),
    100
  );
  const direction = searchParams.get('direction') === 'backward' ? 'backward' : 'forward';

  return { cursor, limit, direction };
}

/**
 * Encode a cursor from an ID
 * Uses base64 encoding for a clean, URL-safe cursor
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf-8').toString('base64url');
}

/**
 * Decode a cursor to an ID
 */
export function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    throw new Error('Invalid cursor format');
  }
}

/**
 * Build Prisma cursor query conditions
 * For forward pagination: fetch items AFTER the cursor
 * For backward pagination: fetch items BEFORE the cursor
 */
export function buildCursorQuery(
  params: CursorPaginationParams,
  orderField: string = 'id',
  orderDirection: 'asc' | 'desc' = 'desc'
): {
  cursor?: { [key: string]: string };
  skip?: number;
  take: number;
  orderBy: { [key: string]: 'asc' | 'desc' };
} {
  const baseQuery = {
    take: params.limit + 1, // Fetch one extra to determine hasMore
    orderBy: { [orderField]: orderDirection },
  };

  if (!params.cursor) {
    return baseQuery;
  }

  const decodedCursor = decodeCursor(params.cursor);

  // For cursor pagination, we skip 1 to avoid returning the cursor item itself
  return {
    ...baseQuery,
    cursor: { [orderField === 'id' ? 'id' : orderField]: decodedCursor },
    skip: 1,
  };
}

/**
 * Process query results and build pagination response
 * @param items - Items returned from database (should have limit + 1 items if more exist)
 * @param params - Original pagination parameters
 * @param total - Total count of items
 * @param idField - Field to use for cursor (default: 'id')
 */
export function buildPaginationResponse<T extends { id: string }>(
  items: T[],
  params: CursorPaginationParams,
  total: number,
  idField: keyof T = 'id'
): {
  items: T[];
  pagination: CursorPaginationResponse;
} {
  const hasMore = items.length > params.limit;
  const resultItems = hasMore ? items.slice(0, params.limit) : items;

  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (resultItems.length > 0) {
    // For forward pagination, next cursor is the last item's ID
    if (hasMore) {
      nextCursor = encodeCursor(String(resultItems[resultItems.length - 1][idField]));
    }

    // Previous cursor is the first item's ID (only if we have a cursor, meaning we're not on first page)
    if (params.cursor) {
      prevCursor = encodeCursor(String(resultItems[0][idField]));
    }
  }

  return {
    items: resultItems,
    pagination: {
      hasMore,
      nextCursor,
      prevCursor,
      total,
    },
  };
}

/**
 * Create a paginated response with both offset and cursor support
 * This allows gradual migration from offset to cursor pagination
 */
export interface HybridPaginationResponse {
  // Cursor-based (new standard)
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  // Offset-based (backward compatibility)
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Build hybrid pagination response that supports both offset and cursor
 * Use this during migration period to maintain backward compatibility
 */
export function buildHybridPaginationResponse<T extends { id: string }>(
  items: T[],
  page: number,
  limit: number,
  total: number,
  idField: keyof T = 'id'
): HybridPaginationResponse {
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;

  let nextCursor: string | null = null;
  let prevCursor: string | null = null;

  if (items.length > 0) {
    if (hasMore) {
      nextCursor = encodeCursor(String(items[items.length - 1][idField]));
    }
    if (page > 1) {
      prevCursor = encodeCursor(String(items[0][idField]));
    }
  }

  return {
    hasMore,
    nextCursor,
    prevCursor,
    page,
    limit,
    total,
    totalPages,
  };
}
