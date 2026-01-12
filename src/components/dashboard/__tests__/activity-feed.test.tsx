/**
 * Activity Feed Component Tests
 * Tests for dashboard recent activity feed
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { ActivityFeed } from '../activity-feed';

describe('ActivityFeed', () => {
  const mockActivities = [
    {
      id: 'activity_1',
      type: 'pattern_created' as const,
      title: 'New Pattern Detected',
      description: 'Airbag deployment failures in Toyota RAV4',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      metadata: { patternId: 'pattern_1', severity: 8.5 },
    },
    {
      id: 'activity_2',
      type: 'complaint_generated' as const,
      title: 'Complaint Generated',
      description: 'Class action complaint for Honda brake defects',
      timestamp: new Date('2024-01-14T15:30:00Z'),
      metadata: { complaintId: 'gen_1' },
    },
    {
      id: 'activity_3',
      type: 'alert' as const,
      title: 'High Severity Alert',
      description: 'Pattern severity increased to critical',
      timestamp: new Date('2024-01-14T12:00:00Z'),
      metadata: { patternId: 'pattern_2', alertLevel: 'critical' },
    },
  ];

  it('should render activity feed with items', () => {
    render(<ActivityFeed activities={mockActivities} />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('New Pattern Detected')).toBeInTheDocument();
    expect(screen.getByText('Complaint Generated')).toBeInTheDocument();
    expect(screen.getByText('High Severity Alert')).toBeInTheDocument();
  });

  it('should display activity descriptions', () => {
    render(<ActivityFeed activities={mockActivities} />);

    expect(screen.getByText(/Airbag deployment failures/)).toBeInTheDocument();
    expect(screen.getByText(/Class action complaint for Honda/)).toBeInTheDocument();
  });

  it('should format timestamps as relative time', () => {
    render(<ActivityFeed activities={mockActivities} />);

    // Should show relative time like "2 days ago" or formatted date
    const timestamps = screen.getAllByTestId('activity-timestamp');
    expect(timestamps).toHaveLength(3);
  });

  it('should show correct icons for different activity types', () => {
    render(<ActivityFeed activities={mockActivities} />);

    expect(screen.getByTestId('icon-pattern_created')).toBeInTheDocument();
    expect(screen.getByTestId('icon-complaint_generated')).toBeInTheDocument();
    expect(screen.getByTestId('icon-alert')).toBeInTheDocument();
  });

  it('should handle click on activity item', () => {
    const onItemClick = vi.fn();
    render(<ActivityFeed activities={mockActivities} onItemClick={onItemClick} />);

    fireEvent.click(screen.getByText('New Pattern Detected'));
    expect(onItemClick).toHaveBeenCalledWith(mockActivities[0]);
  });

  it('should show empty state when no activities', () => {
    render(<ActivityFeed activities={[]} />);

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<ActivityFeed activities={[]} isLoading />);

    const skeletons = screen.getAllByTestId('activity-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should highlight critical alerts', () => {
    render(<ActivityFeed activities={mockActivities} />);

    const criticalAlert = screen.getByText('High Severity Alert').closest('[data-testid="activity-item"]');
    expect(criticalAlert).toHaveClass('border-destructive');
  });

  it('should show "View All" link when hasMore is true', () => {
    render(<ActivityFeed activities={mockActivities} hasMore onViewAll={vi.fn()} />);

    expect(screen.getByRole('link', { name: /view all/i })).toBeInTheDocument();
  });
});
