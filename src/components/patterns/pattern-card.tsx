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
  ShieldCheck,
  ShieldAlert,
  Target,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  // Recall cross-reference
  recallCount?: number;
  hasRecall?: boolean;
  // Lead scoring fields
  leadScore?: number;
  avgSemanticMatch?: number | null;
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

function formatSeverity(score: number): string {
  if (score >= 1000) {
    return `${(score / 1000).toFixed(1)}K`;
  }
  return score.toFixed(0);
}

function getSeverityClass(score: number): string {
  // Updated thresholds for actual score ranges (hundreds to thousands)
  if (score >= 1000) return 'bg-destructive';
  if (score >= 500) return 'bg-warning';
  return 'bg-success';
}

const trendIcons: Record<TrendDirection, { icon: typeof TrendingUp; class: string; testId: string }> = {
  INCREASING: { icon: TrendingUp, class: 'text-destructive', testId: 'icon-trend-up' },
  DECREASING: { icon: TrendingDown, class: 'text-success', testId: 'icon-trend-down' },
  STABLE: { icon: Minus, class: 'text-muted-foreground', testId: 'icon-trend-stable' },
};

function isHighValueLead(pattern: Pattern): boolean {
  // High-value lead: high lead score OR no recalls linked
  return (pattern.leadScore !== undefined && pattern.leadScore >= 50) ||
         pattern.avgSemanticMatch === null;
}

function getLeadScoreClass(score: number): string {
  if (score >= 70) return 'bg-amber-500 text-white';
  if (score >= 50) return 'bg-amber-400 text-black';
  return 'bg-muted text-muted-foreground';
}

function formatLeadScore(score: number): string {
  return score.toFixed(0);
}

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
        'cursor-pointer hover:shadow-md transition-shadow overflow-hidden w-full',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={() => onClick?.(pattern)}
    >
      <CardHeader className="pb-2 block">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-lg truncate" title={pattern.name}>{pattern.name}</CardTitle>
            <p className="text-muted-foreground text-sm truncate">
              {pattern.make} {pattern.model}
            </p>
          </div>
          <Badge
            data-testid="severity-badge"
            className={cn('shrink-0', getSeverityClass(pattern.severityScore))}
          >
            {formatSeverity(pattern.severityScore)}
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
          {/* Recall indicator - key for lead generation */}
          {pattern.hasRecall === false && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    data-testid="no-recall-badge"
                    variant="destructive"
                    className="flex items-center gap-1 cursor-help"
                  >
                    <ShieldAlert className="h-3 w-3" />
                    No Recall
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium mb-1">No Matching Recalls Found</p>
                  <p className="text-xs text-muted-foreground">
                    No recalls with semantic similarity to this pattern were found.
                    This may indicate an unaddressed safety issue - a potential lead
                    for investigation.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {pattern.hasRecall === true && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    data-testid="has-recall-badge"
                    variant="secondary"
                    className="flex items-center gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 cursor-help"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Recall ({pattern.recallCount})
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium mb-1">{pattern.recallCount} Related Recall{pattern.recallCount !== 1 ? 's' : ''} Found</p>
                  <p className="text-xs text-muted-foreground">
                    NHTSA recalls with semantic similarity to this pattern&apos;s complaints
                    have been identified. Click View Details to see the matching recalls
                    and their similarity scores.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Lead Score indicator with tooltip */}
          {pattern.leadScore !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    data-testid="lead-score-badge"
                    className={cn('flex items-center gap-1 cursor-help', getLeadScoreClass(pattern.leadScore))}
                  >
                    <Target className="h-3 w-3" />
                    Lead: {formatLeadScore(pattern.leadScore)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium mb-1">Lead Score: {pattern.leadScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">
                    Calculated from complaint count (30%), severity (30%),
                    semantic recall match (30%), and trend (10%). Higher scores
                    indicate patterns that may not be adequately addressed by existing recalls.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* High-value lead indicator with tooltip */}
          {isHighValueLead(pattern) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    data-testid="high-value-lead-badge"
                    className="flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white animate-pulse cursor-help"
                  >
                    <Sparkles className="h-3 w-3" />
                    Hot Lead
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium mb-1">High-Value Lead Detected</p>
                  <p className="text-xs text-muted-foreground">
                    This pattern has either a high lead score (&ge;50) or no semantic
                    match to existing recalls, indicating it may represent an unaddressed
                    safety issue worth investigating for potential litigation.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
