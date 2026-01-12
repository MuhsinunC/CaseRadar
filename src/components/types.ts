/**
 * Shared Component Types
 * Common type definitions for React components
 */

import type { ReactNode } from 'react';

/**
 * Standard loading state props
 */
export interface LoadingProps {
  isLoading?: boolean;
}

/**
 * Standard error state props
 */
export interface ErrorProps {
  error?: string | null;
}

/**
 * Standard empty state props
 */
export interface EmptyProps {
  emptyMessage?: string;
  emptyIcon?: ReactNode;
}

/**
 * Combined data fetching state props
 */
export interface DataStateProps extends LoadingProps, ErrorProps, EmptyProps {}

/**
 * Pagination props for list components
 */
export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Selection props for selectable lists
 */
export interface SelectionProps<T> {
  selected?: T[];
  onSelect?: (item: T) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  isSelectable?: boolean;
}

/**
 * Sort props for sortable lists
 */
export interface SortProps {
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}

/**
 * Filter props for filterable lists
 */
export interface FilterProps<T> {
  filters: T;
  onFilterChange: (filters: Partial<T>) => void;
  onClearFilters?: () => void;
}

/**
 * Search props for searchable lists
 */
export interface SearchProps {
  searchQuery?: string;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
}

/**
 * Action button configuration
 */
export interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Table column definition
 */
export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (item: T) => ReactNode;
}

/**
 * Modal/dialog props
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

/**
 * Form submission props
 */
export interface FormProps<T> {
  onSubmit: (data: T) => void | Promise<void>;
  isSubmitting?: boolean;
  defaultValues?: Partial<T>;
}

/**
 * Badge variant type
 */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

/**
 * Alert variant type
 */
export type AlertVariant = 'default' | 'destructive' | 'warning' | 'info' | 'success';

/**
 * Size variants
 */
export type Size = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Status type for entities
 */
export type EntityStatus = 'active' | 'inactive' | 'pending' | 'archived';

/**
 * Severity level for alerts/patterns
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Helper function to get severity badge variant
 */
export function getSeverityVariant(severity: number | SeverityLevel): BadgeVariant {
  if (typeof severity === 'number') {
    if (severity >= 8) return 'destructive';
    if (severity >= 5) return 'warning';
    if (severity >= 3) return 'secondary';
    return 'default';
  }

  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'destructive';
    case 'medium':
      return 'warning';
    case 'low':
      return 'secondary';
    default:
      return 'default';
  }
}

/**
 * Helper function to format date for display
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', options ?? {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Helper function to format relative time
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(d);
}
