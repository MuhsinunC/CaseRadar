/**
 * Complaint Filters Component
 * Search and filter controls for complaints
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface ComplaintFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  debounceMs?: number;
  showPresets?: boolean;
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

export function ComplaintFilters({
  filters,
  onFiltersChange,
  debounceMs = 300,
  showPresets = false,
}: ComplaintFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const [isExpanded, setIsExpanded] = useState(true);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFiltersChange({ ...filters, search: localSearch });
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localSearch, debounceMs, filters, onFiltersChange]);

  const handleFilterChange = useCallback(
    (key: keyof Filters, value: unknown) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange]
  );

  const handleClearAll = () => {
    setLocalSearch('');
    onFiltersChange(defaultFilters);
  };

  const handlePreset = (preset: Partial<Filters>) => {
    onFiltersChange({ ...defaultFilters, ...preset });
  };

  // Count active filters
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'search') return false;
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return true;
    return value !== '';
  }).length;

  // Validate year range
  const yearRangeInvalid =
    filters.yearFrom !== undefined &&
    filters.yearTo !== undefined &&
    filters.yearFrom > filters.yearTo;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search complaints..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Mobile filter toggle */}
        <div className="md:hidden mb-4">
          <Button
            data-testid="filter-toggle"
            variant="outline"
            className="w-full"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge
                data-testid="mobile-filters-badge"
                variant="secondary"
                className="ml-2"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Filter fields */}
        <div className={cn('space-y-6', !isExpanded && 'hidden md:block')}>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="make-filter">Make</Label>
              <Input
                id="make-filter"
                value={filters.make}
                onChange={(e) => handleFilterChange('make', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-filter">Model</Label>
              <Input
                id="model-filter"
                value={filters.model}
                onChange={(e) => handleFilterChange('model', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="component-filter">Component</Label>
              <Input
                id="component-filter"
                value={filters.component}
                onChange={(e) => handleFilterChange('component', e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="year-from-filter">Year From</Label>
              <Input
                id="year-from-filter"
                type="number"
                value={filters.yearFrom ?? ''}
                onChange={(e) =>
                  handleFilterChange(
                    'yearFrom',
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year-to-filter">Year To</Label>
              <Input
                id="year-to-filter"
                type="number"
                value={filters.yearTo ?? ''}
                onChange={(e) =>
                  handleFilterChange(
                    'yearTo',
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
              />
            </div>
          </div>

          {yearRangeInvalid && (
            <p className="text-destructive text-sm">Year range invalid</p>
          )}

          {/* Severity checkboxes */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="crash-filter"
                checked={filters.hasCrash}
                onCheckedChange={(checked) =>
                  handleFilterChange('hasCrash', checked)
                }
              />
              <Label htmlFor="crash-filter">Crash</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="fire-filter"
                checked={filters.hasFire}
                onCheckedChange={(checked) =>
                  handleFilterChange('hasFire', checked)
                }
              />
              <Label htmlFor="fire-filter">Fire</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="injury-filter"
                checked={filters.hasInjury}
                onCheckedChange={(checked) =>
                  handleFilterChange('hasInjury', checked)
                }
              />
              <Label htmlFor="injury-filter">Injuries</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="death-filter"
                checked={filters.hasDeath}
                onCheckedChange={(checked) =>
                  handleFilterChange('hasDeath', checked)
                }
              />
              <Label htmlFor="death-filter">Deaths</Label>
            </div>
          </div>

          {/* Quick presets */}
          {showPresets && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreset({ hasDeath: true })}
              >
                With Deaths
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handlePreset({ hasCrash: true, hasDeath: true, hasFire: true })
                }
              >
                High Severity
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handlePreset({
                    yearFrom: new Date().getFullYear() - 1,
                    yearTo: new Date().getFullYear(),
                  })
                }
              >
                Recent
              </Button>
            </div>
          )}

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear all filters
            </Button>
          )}
        </div>

        {/* Active filter badge (desktop) */}
        {activeFilterCount > 0 && (
          <div className="hidden md:block mt-4">
            <Badge data-testid="active-filters-badge" variant="secondary">
              {activeFilterCount}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
