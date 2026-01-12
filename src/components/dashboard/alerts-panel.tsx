/**
 * Alerts Panel Component
 * Displays system alerts and notifications
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info, AlertCircle, X, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type AlertType = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
}

interface AlertsPanelProps {
  alerts: Alert[];
  isLoading?: boolean;
  onDismiss?: (id: string) => void;
}

const alertStyles: Record<AlertType, { bg: string; icon: typeof AlertTriangle }> = {
  critical: { bg: 'bg-destructive/10', icon: AlertCircle },
  warning: { bg: 'bg-warning/10', icon: AlertTriangle },
  info: { bg: 'bg-info/10', icon: Info },
};

const alertPriority: Record<AlertType, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function AlertSkeleton() {
  return (
    <div data-testid="alert-skeleton" className="animate-pulse p-4 rounded-lg bg-muted">
      <div className="h-4 bg-muted-foreground/20 rounded w-3/4 mb-2" />
      <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
    </div>
  );
}

export function AlertsPanel({ alerts, isLoading, onDismiss }: AlertsPanelProps) {
  // Sort alerts by priority (critical first)
  const sortedAlerts = [...alerts].sort(
    (a, b) => alertPriority[a.type] - alertPriority[b.type]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <AlertSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle className="h-8 w-8 text-success mb-2" />
            <p className="text-muted-foreground">No alerts</p>
            <p className="text-muted-foreground text-sm">You&apos;re all caught up!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Alerts
          <Badge data-testid="alerts-count-badge" variant="secondary">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedAlerts.map((alert) => {
          const { bg, icon: Icon } = alertStyles[alert.type];

          return (
            <div
              key={alert.id}
              data-testid={`alert-${alert.id}`}
              className={cn('p-4 rounded-lg relative', bg)}
            >
              <div className="flex gap-3">
                <Icon className={cn(
                  'h-5 w-5 mt-0.5 flex-shrink-0',
                  alert.type === 'critical' && 'text-destructive',
                  alert.type === 'warning' && 'text-warning',
                  alert.type === 'info' && 'text-info'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{alert.title}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {alert.message}
                  </p>
                  {alert.action && (
                    <Link href={alert.action.href}>
                      <Button variant="link" size="sm" className="p-0 h-auto mt-2">
                        {alert.action.label}
                      </Button>
                    </Link>
                  )}
                </div>
                {onDismiss && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 absolute top-2 right-2"
                    onClick={() => onDismiss(alert.id)}
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
