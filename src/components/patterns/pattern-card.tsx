/**
 * Pattern Card Component
 * Displays individual pattern information
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Eye,
  AlertTriangle,
  Skull,
  Car,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface PatternCardProps {
  pattern: Pattern;
  isLoading?: boolean;
  isSelected?: boolean;
  showActions?: boolean;
  onClick?: (pattern: Pattern) => void;
  onGenerateComplaint?: (patternId: string) => void;
}

function formatCount(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function getSeverityColor(score: number): string {
  if (score >= 7) return 'bg-destructive text-destructive-foreground';
  if (score >= 4) return 'bg-warning text-warning-foreground';
  return 'bg-success text-success-foreground';
}

function getSeverityClass(score: number): string {
  if (score >= 7) return 'bg-destructive';
  if (score >= 4) return 'bg-warning';
  return 'bg-success';
}

const trendIcons: Record<TrendDirection, { icon: typeof TrendingUp; class: string; testId: string }> = {
  INCREASING: { icon: TrendingUp, class: 'text-destructive', testId: 'icon-trend-up' },
  DECREASING: { icon: TrendingDown, class: 'text-success', testId: 'icon-trend-down' },
  STABLE: { icon: Minus, class: 'text-muted-foreground', testId: 'icon-trend-stable' },
};

export function PatternCard({
  pattern,
  isLoading,
  isSelected,
  showActions,
  onClick,
  onGenerateComplaint,
}: PatternCardProps) {
  if (isLoading) {
    return (
      <Card data-testid="pattern-card-skeleton" className="animate-pulse">
        <CardHeader>
          <div className="h-5 bg-muted rounded w-3/4 mb-2" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </CardHeader>
        <CardContent>
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const TrendIcon = trendIcons[pattern.trendDirection].icon;

  return (
    <Card
      data-testid="pattern-card"
      className={cn(
        'cursor-pointer hover:shadow-md transition-shadow',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={() => onClick?.(pattern)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{pattern.name}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {pattern.make} {pattern.model}
            </p>
          </div>
          <Badge
            data-testid="severity-badge"
            className={cn('ml-2', getSeverityClass(pattern.severityScore))}
          >
            {pattern.severityScore.toFixed(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
          {pattern.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="outline">
            {pattern.yearStart}-{pattern.yearEnd}
          </Badge>
          <Badge variant="outline">{pattern.component}</Badge>
          <div
            data-testid="trend-indicator"
            className={cn('flex items-center gap-1', trendIcons[pattern.trendDirection].class)}
          >
            <span data-testid={trendIcons[pattern.trendDirection].testId}>
              <TrendIcon className="h-4 w-4" />
            </span>
          </div>
        </div>

        {/* Statistics */}
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{formatCount(pattern.complaintCount)}</span>
          </div>
          {pattern.deathCount > 0 && (
            <div className="flex items-center gap-1 text-destructive">
              <Skull className="h-4 w-4" />
              <span>{pattern.deathCount} deaths</span>
            </div>
          )}
          {pattern.injuryCount > 0 && (
            <div className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span>{pattern.injuryCount} injuries</span>
            </div>
          )}
          {pattern.crashCount > 0 && (
            <div className="flex items-center gap-1 text-warning">
              <Car className="h-4 w-4" />
              <span>{pattern.crashCount} crashes</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(pattern);
              }}
            >
              <Eye className="h-4 w-4 mr-1" />
              View Details
            </Button>
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onGenerateComplaint?.(pattern.id);
              }}
            >
              <FileText className="h-4 w-4 mr-1" />
              Generate Complaint
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
