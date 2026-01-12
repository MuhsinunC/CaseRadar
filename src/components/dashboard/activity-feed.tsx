/**
 * Activity Feed Component
 * Displays recent activity in the dashboard
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, FileText, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type ActivityType = 'pattern_created' | 'complaint_generated' | 'alert';

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface ActivityFeedProps {
  activities: Activity[];
  isLoading?: boolean;
  hasMore?: boolean;
  onItemClick?: (activity: Activity) => void;
  onViewAll?: () => void;
}

const iconMap: Record<ActivityType, typeof TrendingUp> = {
  pattern_created: TrendingUp,
  complaint_generated: FileText,
  alert: AlertTriangle,
};

function ActivitySkeleton() {
  return (
    <div data-testid="activity-skeleton" className="animate-pulse flex gap-3 py-3">
      <div className="h-8 w-8 rounded-full bg-muted" />
      <div className="flex-1">
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}

export function ActivityFeed({
  activities,
  isLoading,
  hasMore,
  onItemClick,
  onViewAll,
}: ActivityFeedProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {[1, 2, 3].map((i) => (
            <ActivitySkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {activities.map((activity) => {
          const Icon = iconMap[activity.type];
          const isCritical = activity.metadata?.alertLevel === 'critical';

          return (
            <div
              key={activity.id}
              data-testid="activity-item"
              className={cn(
                'flex gap-3 py-3 cursor-pointer hover:bg-muted/50 -mx-6 px-6',
                isCritical && 'border-destructive border-l-2'
              )}
              onClick={() => onItemClick?.(activity)}
            >
              <div
                data-testid={`icon-${activity.type}`}
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center',
                  activity.type === 'alert' ? 'bg-destructive/10' : 'bg-primary/10'
                )}
              >
                <Icon className={cn(
                  'h-4 w-4',
                  activity.type === 'alert' ? 'text-destructive' : 'text-primary'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{activity.title}</p>
                <p className="text-muted-foreground text-xs truncate">
                  {activity.description}
                </p>
                <p
                  data-testid="activity-timestamp"
                  className="text-muted-foreground text-xs flex items-center gap-1 mt-1"
                >
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
        {hasMore && onViewAll && (
          <div className="pt-3">
            <Button variant="link" className="w-full" asChild>
              <a href="/activity">View all activity</a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
