/**
 * Stats Cards Component
 * Displays dashboard statistics in card format
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, FileText, AlertTriangle, BarChart3, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatTrend {
  direction: 'up' | 'down';
  value: number;
}

interface Stats {
  totalComplaints: number;
  activePatterns: number;
  generatedComplaints: number;
  highSeverityPatterns: number;
  trends?: {
    complaints?: StatTrend;
    patterns?: StatTrend;
  };
}

interface StatsCardsProps {
  stats: Stats;
  isLoading?: boolean;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

function StatSkeleton() {
  return (
    <div data-testid="stat-skeleton" className="animate-pulse">
      <div className="h-4 bg-muted rounded w-24 mb-2" />
      <div className="h-8 bg-muted rounded w-16" />
    </div>
  );
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total Complaints',
      value: stats.totalComplaints,
      icon: FileText,
      trend: stats.trends?.complaints,
      testId: 'total-complaints-card',
    },
    {
      title: 'Active Patterns',
      value: stats.activePatterns,
      icon: BarChart3,
      trend: stats.trends?.patterns,
      testId: 'active-patterns-card',
    },
    {
      title: 'Generated Complaints',
      value: stats.generatedComplaints,
      icon: Scale,
      testId: 'generated-complaints-card',
    },
    {
      title: 'High Severity',
      value: stats.highSeverityPatterns,
      icon: AlertTriangle,
      testId: 'high-severity-card',
      highlight: stats.highSeverityPatterns > 0,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card
          key={card.testId}
          data-testid={card.testId}
          className={cn(card.highlight && 'border-destructive')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <StatSkeleton />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(card.value)}</div>
                {card.trend && (
                  <p className={cn(
                    'text-xs flex items-center gap-1',
                    card.trend.direction === 'up' ? 'text-destructive' : 'text-success'
                  )}>
                    {card.trend.direction === 'up' ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {card.trend.direction === 'up' ? '+' : '-'}{card.trend.value}%
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
