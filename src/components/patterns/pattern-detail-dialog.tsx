/**
 * Pattern Detail Dialog
 * Shows full pattern details when clicking View Details
 */

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  AlertTriangle,
  Skull,
  Car,
  Calendar,
  Wrench,
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

interface PatternDetailDialogProps {
  pattern: Pattern | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateComplaint?: (patternId: string) => void;
}

const trendLabels: Record<TrendDirection, { label: string; icon: typeof TrendingUp; class: string }> = {
  INCREASING: { label: 'Increasing', icon: TrendingUp, class: 'text-destructive' },
  DECREASING: { label: 'Decreasing', icon: TrendingDown, class: 'text-success' },
  STABLE: { label: 'Stable', icon: Minus, class: 'text-muted-foreground' },
};

function getSeverityLabel(score: number): { label: string; class: string } {
  if (score >= 7) return { label: 'High Severity', class: 'bg-destructive' };
  if (score >= 4) return { label: 'Medium Severity', class: 'bg-warning' };
  return { label: 'Low Severity', class: 'bg-success' };
}

export function PatternDetailDialog({
  pattern,
  open,
  onOpenChange,
  onGenerateComplaint,
}: PatternDetailDialogProps) {
  if (!pattern) return null;

  const formatDate = (date: Date) => {
    try {
      if (!date) return 'N/A';
      const d = new Date(date);
      return isNaN(d.getTime()) ? 'N/A' : format(d, 'MMMM d, yyyy');
    } catch {
      return 'N/A';
    }
  };

  const TrendIcon = trendLabels[pattern.trendDirection].icon;
  const severity = getSeverityLabel(pattern.severityScore);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            {pattern.name}
            <Badge className={cn(severity.class)}>{pattern.severityScore.toFixed(1)}</Badge>
          </DialogTitle>
          <DialogDescription>
            {pattern.make} {pattern.model} ({pattern.yearStart}-{pattern.yearEnd})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold">{pattern.complaintCount}</div>
              <div className="text-sm text-muted-foreground">Complaints</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{pattern.deathCount}</div>
              <div className="text-sm text-muted-foreground">Deaths</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">{pattern.injuryCount}</div>
              <div className="text-sm text-muted-foreground">Injuries</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">{pattern.crashCount}</div>
              <div className="text-sm text-muted-foreground">Crashes</div>
            </div>
          </div>

          <Separator />

          {/* Pattern Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Make</p>
              <p className="font-medium">{pattern.make}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Model</p>
              <p className="font-medium">{pattern.model}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Year Range</p>
              <p className="font-medium">{pattern.yearStart} - {pattern.yearEnd}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Component</p>
              <div className="flex items-center gap-1">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline">{pattern.component}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Trend and Severity */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Trend:</span>
              <div className={cn('flex items-center gap-1', trendLabels[pattern.trendDirection].class)}>
                <TrendIcon className="h-4 w-4" />
                <span className="font-medium">{trendLabels[pattern.trendDirection].label}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Severity:</span>
              <Badge className={cn(severity.class)}>{severity.label}</Badge>
            </div>
          </div>

          <Separator />

          {/* Description */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Pattern Description</p>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm leading-relaxed">{pattern.description}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              First detected: {formatDate(pattern.createdAt)}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Last updated: {formatDate(pattern.updatedAt)}
            </div>
          </div>

          <Separator />

          {/* Action Button */}
          {onGenerateComplaint && (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  onGenerateComplaint(pattern.id);
                  onOpenChange(false);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Generate Complaint from Pattern
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
