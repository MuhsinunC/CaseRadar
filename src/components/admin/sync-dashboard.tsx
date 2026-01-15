/**
 * Admin Sync Dashboard Component
 * Allows admins to trigger and monitor NHTSA bulk imports
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  RefreshCw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Database,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Import progress from API
 */
interface ImportProgress {
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsErrored: number;
  batchNumber: number;
  estimatedTotal: number;
  percentComplete: number;
  startTime: string;
  elapsedMs: number;
  recordsPerSecond: number;
}

/**
 * Import result from API
 */
interface ImportResult {
  success: boolean;
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsErrored: number;
  durationMs: number;
  errors: string[];
}

/**
 * Status response from API
 */
interface StatusResponse {
  status: 'idle' | 'running' | 'downloading' | 'extracting' | 'importing' | 'complete' | 'cancelled' | 'error';
  progress?: ImportProgress;
  result?: ImportResult;
  startedAt?: string;
  error?: string;
  message?: string;
  importNeeded?: boolean;
}

/**
 * Format a number with commas
 */
function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format elapsed time in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: StatusResponse['status'] }) {
  const variants = {
    idle: { label: 'Idle', variant: 'outline' as const, icon: Database },
    running: { label: 'Running', variant: 'default' as const, icon: Loader2 },
    downloading: { label: 'Downloading', variant: 'secondary' as const, icon: Download },
    extracting: { label: 'Extracting', variant: 'secondary' as const, icon: RefreshCw },
    importing: { label: 'Importing', variant: 'default' as const, icon: Loader2 },
    complete: { label: 'Complete', variant: 'success' as const, icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', variant: 'warning' as const, icon: XCircle },
    error: { label: 'Error', variant: 'destructive' as const, icon: AlertTriangle },
  };

  const config = variants[status];
  const Icon = config.icon;
  const isAnimating = ['downloading', 'extracting', 'importing', 'running'].includes(status);

  return (
    <Badge variant={config.variant} data-testid="status-badge" className="flex items-center gap-1">
      <Icon className={cn('h-3 w-3', isAnimating && 'animate-spin')} />
      {config.label}
    </Badge>
  );
}

/**
 * Progress stats display
 */
function ProgressStats({ progress }: { progress: ImportProgress }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4" data-testid="progress-stats">
      <div>
        <p className="text-sm text-muted-foreground">Processed</p>
        <p className="text-lg font-semibold">{formatNumber(progress.recordsProcessed)}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Inserted</p>
        <p className="text-lg font-semibold text-success">{formatNumber(progress.recordsInserted)}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Skipped</p>
        <p className="text-lg font-semibold text-warning">{formatNumber(progress.recordsSkipped)}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Errors</p>
        <p className="text-lg font-semibold text-destructive">{formatNumber(progress.recordsErrored)}</p>
      </div>
    </div>
  );
}

/**
 * Result summary display
 */
function ResultSummary({ result }: { result: ImportResult }) {
  return (
    <Card className={cn(result.success ? 'border-success' : 'border-destructive')} data-testid="result-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
          Import {result.success ? 'Completed' : 'Failed'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Processed</p>
            <p className="text-lg font-semibold">{formatNumber(result.recordsProcessed)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Inserted</p>
            <p className="text-lg font-semibold text-success">{formatNumber(result.recordsInserted)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Duration</p>
            <p className="text-lg font-semibold">{formatDuration(result.durationMs)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Errors</p>
            <p className="text-lg font-semibold text-destructive">{result.errors.length}</p>
          </div>
        </div>
        {result.errors.length > 0 && (
          <div className="mt-4 p-3 bg-destructive/10 rounded-md">
            <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {result.errors.slice(0, 5).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
              {result.errors.length > 5 && (
                <li>...and {result.errors.length - 5} more errors</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Admin Sync Dashboard Component
 */
export function SyncDashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch current status
   */
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/nhtsa/bulk-import');
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Start bulk import
   */
  const startImport = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch('/api/nhtsa/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 1000 }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start import');
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsStarting(false);
    }
  };

  /**
   * Cancel import
   */
  const cancelImport = async () => {
    setIsCancelling(true);
    try {
      const response = await fetch('/api/nhtsa/bulk-import', {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to cancel import');
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchStatus();

    // Poll for updates when import is in progress
    const interval = setInterval(() => {
      if (status && ['downloading', 'extracting', 'importing'].includes(status.status)) {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchStatus, status?.status]);

  const isImportActive = status && ['downloading', 'extracting', 'importing', 'running'].includes(status.status);

  return (
    <div className="space-y-6" data-testid="sync-dashboard">
      {/* Auto-import notification */}
      {status?.importNeeded && status.status === 'idle' && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="font-medium">Database needs population</p>
                <p className="text-sm text-muted-foreground">
                  Your database has fewer than 100,000 complaints. The bulk import will
                  trigger automatically on the next scheduled sync (runs every 6 hours),
                  or you can start it manually below.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                NHTSA Data Sync
              </CardTitle>
              <CardDescription>
                Automatically imports 2.1M+ historical NHTSA complaints when database is under-populated
              </CardDescription>
            </div>
            {status && <StatusBadge status={status.status} />}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {status?.importNeeded && (
              <Button
                onClick={startImport}
                disabled={isLoading || isStarting || isImportActive}
                data-testid="start-import-btn"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Start Import Now
                  </>
                )}
              </Button>
            )}

            {!status?.importNeeded && status?.status === 'idle' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Database has sufficient data. No import needed.
              </div>
            )}

            {isImportActive && (
              <div className="text-sm text-muted-foreground">
                Import in progress. This may take 1-3 hours.
              </div>
            )}

            <Button
              variant="outline"
              onClick={fetchStatus}
              disabled={isLoading}
              data-testid="refresh-btn"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 rounded-md" data-testid="error-message">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress */}
      {status?.progress && isImportActive && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Import Progress</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(status.progress.elapsedMs)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{formatNumber(status.progress.recordsProcessed)} / {formatNumber(status.progress.estimatedTotal)}</span>
                <span>{status.progress.percentComplete}%</span>
              </div>
              <Progress value={status.progress.percentComplete} data-testid="progress-bar" />
              <p className="text-xs text-muted-foreground">
                Processing at {formatNumber(status.progress.recordsPerSecond)} records/sec
              </p>
            </div>
            <ProgressStats progress={status.progress} />
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {status?.result && (
        <ResultSummary result={status.result} />
      )}

      {/* Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How Auto-Sync Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li><strong>Automatic trigger:</strong> When database has &lt; 100,000 complaints, bulk import runs automatically</li>
            <li><strong>Scheduled sync:</strong> Runs every 6 hours via cron job</li>
            <li><strong>Source:</strong> Downloads complete NHTSA flat file (~1.5GB compressed)</li>
            <li><strong>Contents:</strong> 2.1M+ historical complaints since 1995</li>
            <li><strong>Duplicates:</strong> Existing records are skipped automatically</li>
            <li><strong>Duration:</strong> Full import takes 1-3 hours depending on connection speed</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default SyncDashboard;
