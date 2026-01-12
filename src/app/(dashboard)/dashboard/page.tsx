/**
 * Dashboard Page
 * Main dashboard with stats, activity feed, and alerts
 */

'use client';

import { useEffect, useState } from 'react';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { AlertsPanel } from '@/components/dashboard/alerts-panel';

interface DashboardStats {
  totalComplaints: number;
  complaintsChange: number;
  activePatterns: number;
  patternsChange: number;
  generatedComplaints: number;
  generatedChange: number;
  highSeverityPatterns: number;
  severityChange: number;
}

interface Activity {
  id: string;
  type: 'pattern_created' | 'complaint_generated' | 'alert';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [statsRes, activityRes, alertsRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/activity'),
          fetch('/api/dashboard/alerts'),
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        if (activityRes.ok) {
          const activityData = await activityRes.json();
          setActivities(
            activityData.activities.map((a: Activity) => ({
              ...a,
              timestamp: new Date(a.timestamp),
            }))
          );
        }

        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          setAlerts(alertsData.alerts);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  const handleDismissAlert = (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const handleActivityClick = (activity: Activity) => {
    // Navigate to relevant page based on activity type
    console.log('Activity clicked:', activity);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your CaseRadar analytics
        </p>
      </div>

      <StatsCards
        stats={
          stats || {
            totalComplaints: 0,
            complaintsChange: 0,
            activePatterns: 0,
            patternsChange: 0,
            generatedComplaints: 0,
            generatedChange: 0,
            highSeverityPatterns: 0,
            severityChange: 0,
          }
        }
        isLoading={isLoading}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityFeed
          activities={activities}
          isLoading={isLoading}
          hasMore={activities.length >= 10}
          onItemClick={handleActivityClick}
          onViewAll={() => console.log('View all activity')}
        />
        <AlertsPanel
          alerts={alerts}
          isLoading={isLoading}
          onDismiss={handleDismissAlert}
        />
      </div>
    </div>
  );
}
