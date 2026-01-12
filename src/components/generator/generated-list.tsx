/**
 * Generated List Component
 * Displays list of generated legal complaints
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Eye,
  Edit,
  Download,
  Trash2,
  FileText,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type ComplaintStatus = 'DRAFT' | 'FINALIZED' | 'ARCHIVED';

interface Pattern {
  id: string;
  name: string;
  make: string;
  model: string;
}

interface PlaintiffInfo {
  name: string;
  state: string;
}

interface GeneratedComplaint {
  id: string;
  title: string;
  status: ComplaintStatus;
  createdAt: Date;
  pattern: Pattern;
  plaintiffInfo: PlaintiffInfo;
}

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

interface GeneratedListProps {
  complaints: GeneratedComplaint[];
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelect?: (ids: string[]) => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSort?: (config: SortConfig) => void;
}

const statusStyles: Record<ComplaintStatus, string> = {
  DRAFT: 'bg-warning text-warning-foreground',
  FINALIZED: 'bg-success text-success-foreground',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

function ComplaintSkeleton() {
  return (
    <div data-testid="complaint-skeleton" className="animate-pulse p-4 border-b">
      <div className="h-5 bg-muted rounded w-3/4 mb-2" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  );
}

export function GeneratedList({
  complaints,
  isLoading,
  selectable,
  selectedIds = [],
  onSelect,
  onView,
  onEdit,
  onDownload,
  onDelete,
  onSort,
}: GeneratedListProps) {
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | ''>('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Filter by status
  const filteredComplaints = statusFilter
    ? complaints.filter((c) => c.status === statusFilter)
    : complaints;

  // Sort by date (newest first)
  const sortedComplaints = [...filteredComplaints].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect?.(selectedIds.filter((i) => i !== id));
    } else {
      onSelect?.([...selectedIds, id]);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm(null);
    onDelete?.(id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generated Complaints</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {[1, 2, 3].map((i) => (
            <ComplaintSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (complaints.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generated Complaints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No generated complaints</p>
            <p className="text-muted-foreground text-sm">
              Generate your first complaint from a detected pattern.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Generated Complaints</CardTitle>
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="status-filter"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | '')}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="FINALIZED">Finalized</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Bulk actions */}
          {selectable && selectedIds.length > 0 && (
            <div data-testid="bulk-actions" className="p-3 bg-muted border-b flex gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selected
              </span>
              <Button variant="destructive" size="sm">
                Bulk Delete
              </Button>
            </div>
          )}

          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm">
            {selectable && <div className="col-span-1" />}
            <div
              className={cn(
                'col-span-4 cursor-pointer flex items-center gap-1',
                selectable ? '' : 'col-span-5'
              )}
              onClick={() => onSort?.({ field: 'title', direction: 'asc' })}
            >
              Title <ArrowUpDown className="h-4 w-4" />
            </div>
            <div
              className="col-span-2 cursor-pointer flex items-center gap-1"
              onClick={() => onSort?.({ field: 'status', direction: 'asc' })}
            >
              Status <ArrowUpDown className="h-4 w-4" />
            </div>
            <div className="col-span-2">Pattern</div>
            <div className="col-span-2">Plaintiff</div>
            <div className="col-span-1">Actions</div>
          </div>

          {/* Complaint rows */}
          {sortedComplaints.map((complaint) => (
            <div
              key={complaint.id}
              data-testid={`complaint-row-${complaint.id}`}
              className={cn(
                'grid grid-cols-12 gap-4 p-4 border-b hover:bg-muted/50',
                selectedIds.includes(complaint.id) && 'bg-muted'
              )}
            >
              {selectable && (
                <div className="col-span-1">
                  <Checkbox
                    checked={selectedIds.includes(complaint.id)}
                    onCheckedChange={() => handleSelectOne(complaint.id)}
                  />
                </div>
              )}
              <div
                className={cn(
                  'col-span-4 cursor-pointer hover:text-primary',
                  selectable ? '' : 'col-span-5'
                )}
                onClick={() => onView?.(complaint.id)}
              >
                <p className="font-medium truncate">{complaint.title}</p>
                <p className="text-muted-foreground text-xs">
                  {format(complaint.createdAt, 'MMM d, yyyy h:mm a')}
                </p>
              </div>
              <div className="col-span-2">
                <Badge
                  data-testid={`status-badge-${complaint.id}`}
                  className={statusStyles[complaint.status]}
                >
                  {complaint.status}
                </Badge>
              </div>
              <div className="col-span-2 text-sm">
                <p>{complaint.pattern.name}</p>
                <p className="text-muted-foreground text-xs">
                  {complaint.pattern.make} {complaint.pattern.model}
                </p>
              </div>
              <div className="col-span-2 text-sm">
                <p>{complaint.plaintiffInfo.name}</p>
                <p className="text-muted-foreground text-xs">
                  {complaint.plaintiffInfo.state}
                </p>
              </div>
              <div className="col-span-1 flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Preview"
                  onClick={() => onView?.(complaint.id)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {complaint.status === 'DRAFT' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit"
                    onClick={() => onEdit?.(complaint.id)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
                {complaint.status === 'FINALIZED' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Download PDF"
                    onClick={() => onDownload?.(complaint.id)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {complaint.status === 'DRAFT' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    onClick={() => setDeleteConfirm(complaint.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Complaint</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this complaint? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
