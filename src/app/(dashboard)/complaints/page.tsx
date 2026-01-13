/**
 * Complaints Explorer Page
 * Search and browse NHTSA complaints
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { ComplaintTable } from '@/components/complaints/complaint-table';
import { ComplaintFilters } from '@/components/complaints/complaint-filters';
import { ComplaintDetailDialog } from '@/components/complaints/complaint-detail-dialog';

interface Complaint {
  id: string;
  nhtsaId: string;
  make: string;
  model: string;
  year: number;
  component: string;
  description: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
  dateAdded: Date;
}

interface Filters {
  search: string;
  make: string;
  model: string;
  yearFrom: number | undefined;
  yearTo: number | undefined;
  component: string;
  hasCrash: boolean;
  hasFire: boolean;
  hasInjury: boolean;
  hasDeath: boolean;
}

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

const defaultFilters: Filters = {
  search: '',
  make: '',
  model: '',
  yearFrom: undefined,
  yearTo: undefined,
  component: '',
  hasCrash: false,
  hasFire: false,
  hasInjury: false,
  hasDeath: false,
};

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sortConfig, setSortConfig] = useState<SortConfig | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');

      if (filters.search) params.set('search', filters.search);
      if (filters.make) params.set('make', filters.make);
      if (filters.model) params.set('model', filters.model);
      if (filters.yearFrom) params.set('yearFrom', filters.yearFrom.toString());
      if (filters.yearTo) params.set('yearTo', filters.yearTo.toString());
      if (filters.component) params.set('component', filters.component);
      if (filters.hasCrash) params.set('hasCrash', 'true');
      if (filters.hasFire) params.set('hasFire', 'true');
      if (filters.hasInjury) params.set('hasInjury', 'true');
      if (filters.hasDeath) params.set('hasDeath', 'true');

      if (sortConfig) {
        params.set('sortBy', sortConfig.field);
        params.set('sortDir', sortConfig.direction);
      }

      const res = await fetch(`/api/complaints?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setComplaints(
          data.complaints.map((c: Complaint) => ({
            ...c,
            dateAdded: new Date(c.dateAdded),
          }))
        );
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch complaints:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filters, sortConfig, page]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleFiltersChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  const handleSort = (config: SortConfig) => {
    setSortConfig(config);
  };

  const handleRowClick = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setDetailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Complaints Explorer</h1>
        <p className="text-muted-foreground">
          Search and analyze NHTSA vehicle complaints
        </p>
      </div>

      <ComplaintFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        showPresets
      />

      <ComplaintTable
        complaints={complaints}
        isLoading={isLoading}
        selectable
        selectedIds={selectedIds}
        onSelect={setSelectedIds}
        onRowClick={handleRowClick}
        onSort={handleSort}
        sortConfig={sortConfig}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Complaint Detail Dialog */}
      <ComplaintDetailDialog
        complaint={selectedComplaint}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}
