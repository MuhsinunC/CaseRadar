/**
 * API Types
 * Centralized type definitions for API routes
 */

/**
 * Standard API error response
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Standard API success response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

/**
 * API metadata (pagination, etc.)
 */
export interface ApiMeta {
  pagination?: PaginationMeta;
  timestamp?: string;
}

/**
 * Pagination request parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Pagination response metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Common filter parameters for list endpoints
 */
export interface BaseFilters {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Complaint-specific filters
 */
export interface ComplaintFilters extends BaseFilters {
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  component?: string;
  state?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasCrash?: boolean;
  hasFire?: boolean;
  hasInjury?: boolean;
}

/**
 * Pattern-specific filters
 */
export interface PatternFilters extends BaseFilters {
  status?: 'ACTIVE' | 'ARCHIVED' | 'INVESTIGATING';
  severityMin?: number;
  severityMax?: number;
  vehicleMake?: string;
}

/**
 * Date range filter
 */
export interface DateRange {
  from?: Date;
  to?: Date;
}

/**
 * Sort configuration
 */
export interface SortConfig {
  field: string;
  order: 'asc' | 'desc';
}

/**
 * Authenticated user context for API routes
 */
export interface ApiUserContext {
  userId: string;
  organizationId: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
}
