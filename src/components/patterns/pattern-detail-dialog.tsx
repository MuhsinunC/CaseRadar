/**
 * Pattern Detail Dialog
 * Shows full pattern details when clicking View Details
 */

'use client';

import { useEffect, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  AlertTriangle,
  Flame,
  Car,
  Calendar,
  Wrench,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type TrendDirection = 'INCREASING' | 'DECREASING' | 'STABLE';

interface Complaint {
  id: string;
  description: string;
  make: string;
  model: string;
  year: number;
  component?: string;
  crash?: boolean;
  fire?: boolean;
  injuries?: number;
  deaths?: number;
}

interface RecallMatch {
  patternRecallId: string;
  recallId: string;
  matchScore: number;
  matchReason?: string;
  recall: {
    id: string;
    nhtsaCampaignNumber: string;
    manufacturer: string;
    make: string;
    model: string;
    year: number;
    component: string;
    summary: string;
  };
}

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
  complaints?: Complaint[];
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
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoadingComplaints, setIsLoadingComplaints] = useState(false);
  const [complaintsExpanded, setComplaintsExpanded] = useState(true);

  // Recall matching state
  const [recallMatches, setRecallMatches] = useState<RecallMatch[]>([]);
  const [avgSemanticMatch, setAvgSemanticMatch] = useState<number | null>(null);
  const [isLoadingRecalls, setIsLoadingRecalls] = useState(false);
  const [recallsExpanded, setRecallsExpanded] = useState(true);
  const [isRunningMatch, setIsRunningMatch] = useState(false);

  // Fetch complaints and recall matches when dialog opens
  useEffect(() => {
    if (open && pattern?.id) {
      // Fetch complaints
      setIsLoadingComplaints(true);
      setComplaints([]);
      fetch(`/api/patterns/${pattern.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.pattern?.complaints) {
            setComplaints(data.pattern.complaints);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch pattern complaints:', error);
        })
        .finally(() => {
          setIsLoadingComplaints(false);
        });

      // Fetch recall matches
      setIsLoadingRecalls(true);
      setRecallMatches([]);
      fetch(`/api/patterns/${pattern.id}/semantic-match`)
        .then((res) => res.json())
        .then((data) => {
          if (data.matches) {
            setRecallMatches(data.matches);
            setAvgSemanticMatch(data.avgSemanticMatch);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch recall matches:', error);
        })
        .finally(() => {
          setIsLoadingRecalls(false);
        });
    }
  }, [open, pattern?.id]);

  // Function to trigger semantic matching
  const runSemanticMatch = async () => {
    if (!pattern?.id) return;
    setIsRunningMatch(true);
    try {
      const res = await fetch(`/api/patterns/${pattern.id}/semantic-match`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.matches) {
        // Refresh the matches
        const refreshRes = await fetch(`/api/patterns/${pattern.id}/semantic-match`);
        const refreshData = await refreshRes.json();
        if (refreshData.matches) {
          setRecallMatches(refreshData.matches);
          setAvgSemanticMatch(refreshData.avgSemanticMatch);
        }
      }
    } catch (error) {
      console.error('Failed to run semantic matching:', error);
    } finally {
      setIsRunningMatch(false);
    }
  };

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

          <Separator />

          {/* Linked Complaints Section */}
          <div>
            <button
              onClick={() => setComplaintsExpanded(!complaintsExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  Linked Complaints ({isLoadingComplaints ? '...' : complaints.length})
                </span>
              </div>
              {complaintsExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {complaintsExpanded && (
              <div className="mt-3">
                {isLoadingComplaints ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : complaints.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No complaints linked to this pattern yet.</p>
                    <p className="text-xs mt-1">
                      Run pattern detection to link complaints.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-64">
                    <div className="space-y-2 pr-4">
                      {complaints.map((complaint) => (
                        <div
                          key={complaint.id}
                          className="p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">
                                {complaint.year} {complaint.make} {complaint.model}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {complaint.crash && (
                                <Badge variant="destructive" className="text-xs">Crash</Badge>
                              )}
                              {complaint.fire && (
                                <Badge variant="destructive" className="text-xs">
                                  <Flame className="h-3 w-3 mr-1" />
                                  Fire
                                </Badge>
                              )}
                              {(complaint.injuries ?? 0) > 0 && (
                                <Badge variant="outline" className="text-xs text-warning border-warning">
                                  {complaint.injuries} injured
                                </Badge>
                              )}
                              {(complaint.deaths ?? 0) > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {complaint.deaths} death{(complaint.deaths ?? 0) > 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {complaint.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Linked Recalls Section */}
          <div>
            <button
              onClick={() => setRecallsExpanded(!recallsExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  Linked Recalls ({isLoadingRecalls ? '...' : recallMatches.length})
                </span>
                {avgSemanticMatch !== null && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={cn(
                            'ml-2',
                            avgSemanticMatch >= 0.7
                              ? 'border-success text-success'
                              : avgSemanticMatch >= 0.4
                              ? 'border-warning text-warning'
                              : 'border-destructive text-destructive'
                          )}
                        >
                          {(avgSemanticMatch * 100).toFixed(0)}% match
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-sm">
                          Average semantic similarity between this pattern&apos;s complaints
                          and linked recalls. Higher scores indicate recalls that better
                          address this issue.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    runSemanticMatch();
                  }}
                  disabled={isRunningMatch}
                >
                  {isRunningMatch ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                {recallsExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {recallsExpanded && (
              <div className="mt-3">
                {isLoadingRecalls ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : recallMatches.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recall matches found.</p>
                    <p className="text-xs mt-1">
                      Click the refresh button to run semantic matching.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-64">
                    <div className="space-y-2 pr-4">
                      {recallMatches.map((match) => (
                        <div
                          key={match.patternRecallId}
                          className="p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">
                                {match.recall.nhtsaCampaignNumber}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {match.recall.component}
                              </Badge>
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    className={cn(
                                      'text-xs',
                                      match.matchScore >= 0.7
                                        ? 'bg-success'
                                        : match.matchScore >= 0.4
                                        ? 'bg-warning'
                                        : 'bg-destructive'
                                    )}
                                  >
                                    {(match.matchScore * 100).toFixed(0)}%
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-sm">{match.matchReason || 'Semantic similarity score'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1">
                            {match.recall.year} {match.recall.make} {match.recall.model} • {match.recall.manufacturer}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {match.recall.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
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
