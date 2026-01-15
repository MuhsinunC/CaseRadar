/**
 * Leads Dashboard Page
 * Displays patterns ranked by lead potential
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Target,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Lead {
  pattern: {
    id: string;
    name: string;
    description: string;
    make: string;
    model: string;
    yearStart: number;
    yearEnd: number;
    component: string;
    complaintCount: number;
    severityScore: number;
    trendDirection: string;
    crashCount: number;
    fireCount: number;
    injuryCount: number;
    deathCount: number;
    recallCount: number;
    hasRecall: boolean;
    avgSemanticMatch: number | null;
  };
  leadScore: number;
  breakdown: {
    complaintFactor: number;
    severityFactor: number;
    semanticFactor: number;
    trendFactor: number;
  };
}

function LeadCard({ lead, rank }: { lead: Lead; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const { pattern, leadScore, breakdown } = lead;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-amber-500';
    if (score >= 50) return 'text-amber-400';
    return 'text-muted-foreground';
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white';
    if (rank === 2) return 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800';
    if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge className={cn('text-lg px-3 py-1', getRankBadge(rank))}>
              #{rank}
            </Badge>
            <div>
              <CardTitle className="text-lg">{pattern.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {pattern.make} {pattern.model} ({pattern.yearStart}-{pattern.yearEnd})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn('text-2xl font-bold', getScoreColor(leadScore))}>
              {leadScore.toFixed(0)}
            </div>
            <Target className={cn('h-6 w-6', getScoreColor(leadScore))} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {pattern.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline">{pattern.component}</Badge>
          <Badge variant="outline">{pattern.complaintCount} complaints</Badge>
          {!pattern.hasRecall && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              No Recall
            </Badge>
          )}
          {pattern.avgSemanticMatch !== null && pattern.avgSemanticMatch < 0.5 && (
            <Badge className="bg-amber-500 text-white flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Low Match
            </Badge>
          )}
          {pattern.trendDirection === 'INCREASING' && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Increasing
            </Badge>
          )}
        </div>

        {/* Severity stats */}
        <div className="grid grid-cols-4 gap-4 text-center mb-4">
          <div>
            <div className="text-2xl font-bold">{pattern.complaintCount}</div>
            <div className="text-xs text-muted-foreground">Complaints</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-destructive">{pattern.deathCount}</div>
            <div className="text-xs text-muted-foreground">Deaths</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-warning">{pattern.injuryCount}</div>
            <div className="text-xs text-muted-foreground">Injuries</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-warning">{pattern.crashCount}</div>
            <div className="text-xs text-muted-foreground">Crashes</div>
          </div>
        </div>

        {/* Expandable score breakdown */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
          {expanded ? 'Hide' : 'Show'} Score Breakdown
        </Button>

        {expanded && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-3">Lead Score Breakdown</h4>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Complaint Volume</span>
                  <span>{(breakdown.complaintFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${breakdown.complaintFactor * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Severity</span>
                  <span>{(breakdown.severityFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${breakdown.severityFactor * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Recall Gap (inverse match)</span>
                  <span>{(breakdown.semanticFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${breakdown.semanticFactor * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Trend</span>
                  <span>{(breakdown.trendFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${breakdown.trendFactor * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [minLeadScore, setMinLeadScore] = useState(30);
  const [minComplaintCount, setMinComplaintCount] = useState(10);
  const [maxSemanticMatch, setMaxSemanticMatch] = useState(0.7);

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        minLeadScore: minLeadScore.toString(),
        minComplaintCount: minComplaintCount.toString(),
        maxSemanticMatch: maxSemanticMatch.toString(),
        pageSize: '50',
      });
      const response = await fetch(`/api/leads?${params}`);
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      setLeads(data.leads);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Export functionality
  const exportToCSV = () => {
    if (leads.length === 0) return;

    const headers = [
      'Rank',
      'Lead Score',
      'Pattern Name',
      'Make',
      'Model',
      'Year Range',
      'Component',
      'Complaints',
      'Deaths',
      'Injuries',
      'Crashes',
      'Has Recall',
      'Avg Semantic Match',
      'Trend',
      'Description',
    ];

    const rows = leads.map((lead, index) => [
      index + 1,
      lead.leadScore.toFixed(1),
      `"${lead.pattern.name.replace(/"/g, '""')}"`,
      lead.pattern.make,
      lead.pattern.model || '',
      `${lead.pattern.yearStart}-${lead.pattern.yearEnd}`,
      lead.pattern.component,
      lead.pattern.complaintCount,
      lead.pattern.deathCount,
      lead.pattern.injuryCount,
      lead.pattern.crashCount,
      lead.pattern.hasRecall ? 'Yes' : 'No',
      lead.pattern.avgSemanticMatch !== null ? (lead.pattern.avgSemanticMatch * 100).toFixed(1) + '%' : 'N/A',
      lead.pattern.trendDirection,
      `"${(lead.pattern.description || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    downloadFile(csv, 'leads-export.csv', 'text/csv');
  };

  const exportToJSON = () => {
    if (leads.length === 0) return;

    const exportData = leads.map((lead, index) => ({
      rank: index + 1,
      leadScore: lead.leadScore,
      breakdown: lead.breakdown,
      pattern: {
        id: lead.pattern.id,
        name: lead.pattern.name,
        make: lead.pattern.make,
        model: lead.pattern.model,
        yearRange: `${lead.pattern.yearStart}-${lead.pattern.yearEnd}`,
        component: lead.pattern.component,
        stats: {
          complaintCount: lead.pattern.complaintCount,
          deathCount: lead.pattern.deathCount,
          injuryCount: lead.pattern.injuryCount,
          crashCount: lead.pattern.crashCount,
        },
        hasRecall: lead.pattern.hasRecall,
        avgSemanticMatch: lead.pattern.avgSemanticMatch,
        trendDirection: lead.pattern.trendDirection,
        description: lead.pattern.description,
      },
    }));

    const json = JSON.stringify({ exportedAt: new Date().toISOString(), leads: exportData }, null, 2);
    downloadFile(json, 'leads-export.json', 'application/json');
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Target className="h-8 w-8 text-amber-500" />
            Lead Generation
          </h1>
          <p className="text-muted-foreground mt-1">
            Patterns with high potential that may not be addressed by existing recalls
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={leads.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToJSON}>
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={fetchLeads} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Leads</CardTitle>
            <CardDescription>Adjust criteria to find the most relevant leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Minimum Lead Score: {minLeadScore}</Label>
                <Input
                  type="range"
                  value={minLeadScore}
                  onChange={(e) => setMinLeadScore(parseInt(e.target.value))}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Complaint Count</Label>
                <Input
                  type="number"
                  value={minComplaintCount}
                  onChange={(e) => setMinComplaintCount(parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Semantic Match: {maxSemanticMatch.toFixed(2)}</Label>
                <Input
                  type="range"
                  value={maxSemanticMatch * 100}
                  onChange={(e) => setMaxSemanticMatch(parseInt(e.target.value) / 100)}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
            </div>
            <Button className="mt-4" onClick={fetchLeads}>
              Apply Filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{leads.length}</div>
            <p className="text-sm text-muted-foreground">Total Leads Found</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-500">
              {leads.filter((l) => l.leadScore >= 70).length}
            </div>
            <p className="text-sm text-muted-foreground">High-Value Leads (70+)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">
              {leads.filter((l) => !l.pattern.hasRecall).length}
            </div>
            <p className="text-sm text-muted-foreground">Without Any Recall</p>
          </CardContent>
        </Card>
      </div>

      {/* Error State */}
      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-full mb-2" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Leads List */}
      {!loading && !error && (
        <div className="grid gap-4">
          {leads.map((lead, index) => (
            <LeadCard key={lead.pattern.id} lead={lead} rank={index + 1} />
          ))}
          {leads.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Leads Found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters to find potential leads
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
