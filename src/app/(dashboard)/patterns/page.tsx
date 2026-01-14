/**
 * Patterns Page
 * View detected patterns and start complaint generation
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PatternCard } from '@/components/patterns/pattern-card';
import { PatternDetailDialog } from '@/components/patterns/pattern-detail-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, SlidersHorizontal } from 'lucide-react';

type TrendDirection = 'INCREASING' | 'DECREASING' | 'STABLE';

interface Pattern {
  id: string;
  name: string;
  description: string;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  component: string;
  severityScore: number;
  trendDirection: TrendDirection;
  complaintCount: number;
  deathCount: number;
  injuryCount: number;
  crashCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function PatternsPage() {
  const router = useRouter();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSeverity, setMinSeverity] = useState<number | undefined>();
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    async function fetchPatterns() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', '100'); // Request more patterns
        if (searchQuery) params.set('search', searchQuery);
        if (minSeverity) params.set('minSeverity', minSeverity.toString());

        const res = await fetch(`/api/patterns?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setPatterns(
            data.patterns.map((p: Pattern) => ({
              ...p,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            }))
          );
        }
      } catch (error) {
        console.error('Failed to fetch patterns:', error);
      } finally {
        setIsLoading(false);
      }
    }

    const debounce = setTimeout(fetchPatterns, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, minSeverity]);

  const handlePatternClick = (pattern: Pattern) => {
    setSelectedPattern(pattern);
    setDetailDialogOpen(true);
  };

  const handleGenerateComplaint = (patternId: string) => {
    router.push(`/generator?patternId=${patternId}`);
  };

  const severityFilters = [
    { label: 'All', value: undefined },
    { label: 'High (1000+)', value: 1000 },
    { label: 'Medium (500+)', value: 500 },
    { label: 'Low (<500)', value: 0 },
  ];

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div>
        <h1 className="text-3xl font-bold">Pattern Detector</h1>
        <p className="text-muted-foreground">
          Analyze detected patterns in NHTSA complaint data
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patterns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 items-center">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          {severityFilters.map((filter) => (
            <Button
              key={filter.label}
              variant={minSeverity === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMinSeverity(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats summary */}
      <div className="flex gap-4 flex-wrap">
        <Badge variant="secondary" className="text-sm py-1 px-3">
          {patterns.length} patterns found
        </Badge>
        <Badge variant="destructive" className="text-sm py-1 px-3">
          {patterns.filter((p) => p.severityScore >= 1000).length} high severity
        </Badge>
        <Badge variant="outline" className="text-sm py-1 px-3">
          {patterns.filter((p) => p.trendDirection === 'INCREASING').length} trending up
        </Badge>
      </div>

      {/* Pattern grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <PatternCard
              key={i}
              pattern={{} as Pattern}
              isLoading
            />
          ))}
        </div>
      ) : patterns.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No patterns found</p>
          <p className="text-muted-foreground text-sm">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {patterns.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              isSelected={selectedPattern?.id === pattern.id}
              showActions
              onClick={handlePatternClick}
              onGenerateComplaint={handleGenerateComplaint}
            />
          ))}
        </div>
      )}

      {/* Pattern Detail Dialog */}
      <PatternDetailDialog
        pattern={selectedPattern}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onGenerateComplaint={handleGenerateComplaint}
      />
    </div>
  );
}
