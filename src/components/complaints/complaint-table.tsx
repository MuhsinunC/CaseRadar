/**
 * Complaint Table Component
 * Displays NHTSA complaints in a data table
 */

'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ArrowUpDown, Flame, Car, AlertTriangle, Skull } from 'lucide-react';

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

interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

interface ComplaintTableProps {
  complaints: Complaint[];
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelect?: (ids: string[]) => void;
  onRowClick?: (complaint: Complaint) => void;
  onSort?: (config: SortConfig) => void;
  sortConfig?: SortConfig;
}

function TableRowSkeleton() {
  return (
    <TableRow data-testid="table-row-skeleton">
      <TableCell colSpan={7}>
        <div className="animate-pulse flex gap-4">
          <div className="h-4 bg-muted rounded w-20" />
          <div className="h-4 bg-muted rounded w-16" />
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-4 bg-muted rounded flex-1" />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ComplaintTable({
  complaints,
  isLoading,
  selectable,
  selectedIds = [],
  onSelect,
  onRowClick,
  onSort,
  sortConfig,
}: ComplaintTableProps) {
  const handleSelectAll = () => {
    if (selectedIds.length === complaints.length) {
      onSelect?.([]);
    } else {
      onSelect?.(complaints.map((c) => c.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelect?.(selectedIds.filter((i) => i !== id));
    } else {
      onSelect?.([...selectedIds, id]);
    }
  };

  const handleSort = (field: string) => {
    if (sortConfig?.field === field) {
      onSort?.({
        field,
        direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
      });
    } else {
      onSort?.({ field, direction: 'asc' });
    }
  };

  if (!isLoading && complaints.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No complaints found</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.length === complaints.length && complaints.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
            )}
            <TableHead
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('nhtsaId')}
            >
              <div className="flex items-center gap-1">
                NHTSA ID
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('make')}
            >
              <div className="flex items-center gap-1">
                Make
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead>Model</TableHead>
            <TableHead
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('year')}
            >
              <div className="flex items-center gap-1">
                Year
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
            <TableHead>Component</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="max-w-xs">Description</TableHead>
            <TableHead
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort('dateAdded')}
            >
              <div className="flex items-center gap-1">
                Date
                <ArrowUpDown className="h-4 w-4" />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <>
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
            </>
          ) : (
            complaints.map((complaint) => (
              <TableRow
                key={complaint.id}
                className={cn(
                  'cursor-pointer hover:bg-muted/50',
                  selectedIds.includes(complaint.id) && 'bg-muted'
                )}
                onClick={() => onRowClick?.(complaint)}
              >
                {selectable && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(complaint.id)}
                      onCheckedChange={() => handleSelectOne(complaint.id)}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs">
                  {complaint.nhtsaId}
                </TableCell>
                <TableCell>{complaint.make}</TableCell>
                <TableCell>{complaint.model}</TableCell>
                <TableCell>{complaint.year}</TableCell>
                <TableCell>
                  <Badge variant="outline">{complaint.component}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {complaint.crash && (
                      <span data-testid="severity-crash" title="Crash">
                        <Car className="h-4 w-4 text-warning" />
                      </span>
                    )}
                    {complaint.fire && (
                      <span data-testid="severity-fire" title="Fire">
                        <Flame className="h-4 w-4 text-destructive" />
                      </span>
                    )}
                    {complaint.injuries > 0 && (
                      <span data-testid="severity-injuries" title={`${complaint.injuries} injuries`}>
                        <AlertTriangle className="h-4 w-4 text-warning" />
                      </span>
                    )}
                    {complaint.deaths > 0 && (
                      <span data-testid="severity-deaths" title={`${complaint.deaths} deaths`}>
                        <Skull className="h-4 w-4 text-destructive" />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell
                  data-testid={`description-${complaint.id}`}
                  className="max-w-xs text-sm text-muted-foreground"
                  title={complaint.description}
                >
                  <span className="block truncate max-w-xs">
                    {complaint.description.slice(0, 100)}
                    {complaint.description.length > 100 && '...'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(complaint.dateAdded, 'MMM d, yyyy')}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
