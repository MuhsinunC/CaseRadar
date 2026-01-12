/**
 * Stats Cards Component Tests
 * Tests for dashboard statistics display cards
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { StatsCards } from '../stats-cards';

describe('StatsCards', () => {
  const mockStats = {
    totalComplaints: 15000,
    activePatterns: 45,
    generatedComplaints: 12,
    highSeverityPatterns: 8,
  };

  it('should render all stat cards', () => {
    render(<StatsCards stats={mockStats} />);

    expect(screen.getByText('Total Complaints')).toBeInTheDocument();
    expect(screen.getByText('Active Patterns')).toBeInTheDocument();
    expect(screen.getByText('Generated Complaints')).toBeInTheDocument();
    expect(screen.getByText('High Severity')).toBeInTheDocument();
  });

  it('should display correct stat values', () => {
    render(<StatsCards stats={mockStats} />);

    expect(screen.getByText('15,000')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('should show loading state when isLoading is true', () => {
    render(<StatsCards stats={mockStats} isLoading />);

    // Should show skeleton loaders
    const skeletons = screen.getAllByTestId('stat-skeleton');
    expect(skeletons).toHaveLength(4);
  });

  it('should format large numbers with commas', () => {
    const largeStats = {
      ...mockStats,
      totalComplaints: 1234567,
    };
    render(<StatsCards stats={largeStats} />);

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('should show trend indicators when provided', () => {
    const statsWithTrends = {
      ...mockStats,
      trends: {
        complaints: { direction: 'up' as const, value: 12 },
        patterns: { direction: 'down' as const, value: 5 },
      },
    };
    render(<StatsCards stats={statsWithTrends} />);

    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('-5%')).toBeInTheDocument();
  });

  it('should apply correct styling for high severity count', () => {
    render(<StatsCards stats={mockStats} />);

    const highSeverityCard = screen.getByTestId('high-severity-card');
    expect(highSeverityCard).toHaveClass('border-destructive');
  });
});
