'use client';

/**
 * Pipeline Dashboard Component
 * Displays pipeline status and allows manual triggering of the complaint processing pipeline.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Play, Zap, Database, Brain, AlertCircle } from 'lucide-react';

interface PipelineStats {
  complaints: {
    total: number;
    withEmbeddings: number;
    withoutEmbeddings: number;
    percentComplete: number;
  };
  patterns: {
    total: number;
    avgComplaintCount: number;
    avgSeverityScore: number;
  };
  pipelineStatus: {
    stage: 'idle' | 'embeddings' | 'patterns' | 'complete' | 'error';
    progress: number;
    message: string;
  };
}

interface PipelineResult {
  success: boolean;
  result: {
    stage: string;
    embeddings: {
      processed: number;
      remaining: number;
      errors: string[];
    };
    patterns: {
      created: number;
      updated: number;
      merged: number;
      complaintsProcessed: number;
      noiseCount: number;
    };
    durationMs: number;
    error?: string;
  };
}

export function PipelineDashboard() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch pipeline stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/pipeline');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    }
  };

  // Run the pipeline
  const runPipeline = async (options: { maxEmbeddings?: number; skipEmbeddings?: boolean; skipPatterns?: boolean } = {}) => {
    setIsRunning(true);
    setError(null);
    setLastResult(null);

    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Pipeline failed');
      }

      const data = await response.json();
      setLastResult(data);
      await fetchStats(); // Refresh stats after pipeline completes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  // Fetch stats on mount and periodically when running
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, isRunning ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const getStatusBadge = () => {
    if (!stats) return null;
    const stage = stats.pipelineStatus.stage;

    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      idle: { variant: 'secondary', icon: <Database className="h-3 w-3 mr-1" /> },
      embeddings: { variant: 'default', icon: <Zap className="h-3 w-3 mr-1 animate-pulse" /> },
      patterns: { variant: 'default', icon: <Brain className="h-3 w-3 mr-1 animate-pulse" /> },
      complete: { variant: 'outline', icon: <RefreshCw className="h-3 w-3 mr-1" /> },
      error: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3 mr-1" /> },
    };

    const config = variants[stage] || variants.idle;

    return (
      <Badge variant={config.variant} className="ml-2">
        {config.icon}
        {stage.charAt(0).toUpperCase() + stage.slice(1)}
      </Badge>
    );
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <Brain className="h-5 w-5 mr-2" />
              Pattern Generation Pipeline
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>
              Generate embeddings and detect patterns from complaints
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => runPipeline({ maxEmbeddings: 1000 })}
              disabled={isRunning}
            >
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? 'Running...' : 'Run Pipeline'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Section */}
        {isRunning && stats && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{stats.pipelineStatus.message}</span>
              <span>{stats.pipelineStatus.progress}%</span>
            </div>
            <Progress value={stats.pipelineStatus.progress} />
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Complaints Stats */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Complaints</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Total:</div>
                <div className="font-mono">{stats.complaints.total.toLocaleString()}</div>
                <div className="text-muted-foreground">With Embeddings:</div>
                <div className="font-mono text-green-600">{stats.complaints.withEmbeddings.toLocaleString()}</div>
                <div className="text-muted-foreground">Without Embeddings:</div>
                <div className="font-mono text-yellow-600">{stats.complaints.withoutEmbeddings.toLocaleString()}</div>
                <div className="text-muted-foreground">Coverage:</div>
                <div className="font-mono">{stats.complaints.percentComplete.toFixed(1)}%</div>
              </div>
            </div>

            {/* Pattern Stats */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Patterns</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Total Patterns:</div>
                <div className="font-mono">{stats.patterns.total}</div>
                <div className="text-muted-foreground">Avg Complaints/Pattern:</div>
                <div className="font-mono">{stats.patterns.avgComplaintCount.toFixed(0)}</div>
                <div className="text-muted-foreground">Avg Severity:</div>
                <div className="font-mono">{stats.patterns.avgSeverityScore.toFixed(0)}</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Quick Actions</h4>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runPipeline({ maxEmbeddings: 100, skipPatterns: true })}
                  disabled={isRunning}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Generate 100 Embeddings
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runPipeline({ skipEmbeddings: true })}
                  disabled={isRunning}
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Regenerate Patterns Only
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runPipeline({ maxEmbeddings: 5000 })}
                  disabled={isRunning}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Full Pipeline (5k)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Last Result */}
        {lastResult && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-semibold text-sm mb-2">Last Pipeline Result</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Embeddings Generated:</div>
                <div className="font-mono text-lg">{lastResult.result.embeddings.processed}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Patterns Created:</div>
                <div className="font-mono text-lg">{lastResult.result.patterns.created}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Complaints Processed:</div>
                <div className="font-mono text-lg">{lastResult.result.patterns.complaintsProcessed}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Duration:</div>
                <div className="font-mono text-lg">{(lastResult.result.durationMs / 1000).toFixed(1)}s</div>
              </div>
            </div>
            {lastResult.result.embeddings.errors.length > 0 && (
              <div className="mt-2 text-sm text-destructive">
                {lastResult.result.embeddings.errors.length} errors during processing
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
