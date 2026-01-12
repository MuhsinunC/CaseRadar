/**
 * Pattern Card Component Tests
 * Tests for individual pattern display card
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { PatternCard } from '../pattern-card';

describe('PatternCard', () => {
  const mockPattern = {
    id: 'pattern_1',
    name: 'Airbag Deployment Failures',
    description: 'Pattern of airbag failures in 2020+ Toyota vehicles during frontal collisions',
    make: 'Toyota',
    model: 'RAV4',
    yearStart: 2020,
    yearEnd: 2023,
    component: 'AIR BAGS',
    severityScore: 8.5,
    trendDirection: 'INCREASING' as const,
    complaintCount: 150,
    deathCount: 2,
    injuryCount: 45,
    crashCount: 78,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
  };

  it('should render pattern card with name and description', () => {
    render(<PatternCard pattern={mockPattern} />);

    expect(screen.getByText('Airbag Deployment Failures')).toBeInTheDocument();
    expect(screen.getByText(/Pattern of airbag failures/)).toBeInTheDocument();
  });

  it('should display vehicle information', () => {
    render(<PatternCard pattern={mockPattern} />);

    expect(screen.getByText('Toyota RAV4')).toBeInTheDocument();
    expect(screen.getByText('2020-2023')).toBeInTheDocument();
    expect(screen.getByText('AIR BAGS')).toBeInTheDocument();
  });

  it('should display severity score with correct styling', () => {
    render(<PatternCard pattern={mockPattern} />);

    const severityBadge = screen.getByTestId('severity-badge');
    expect(severityBadge).toHaveTextContent('8.5');
    expect(severityBadge).toHaveClass('bg-destructive'); // High severity
  });

  it('should show different severity styling based on score', () => {
    const lowSeverityPattern = { ...mockPattern, severityScore: 3.5 };
    const { rerender } = render(<PatternCard pattern={lowSeverityPattern} />);

    expect(screen.getByTestId('severity-badge')).toHaveClass('bg-success');

    const mediumSeverityPattern = { ...mockPattern, severityScore: 6.0 };
    rerender(<PatternCard pattern={mediumSeverityPattern} />);

    expect(screen.getByTestId('severity-badge')).toHaveClass('bg-warning');
  });

  it('should display trend indicator', () => {
    render(<PatternCard pattern={mockPattern} />);

    const trendIndicator = screen.getByTestId('trend-indicator');
    expect(trendIndicator).toBeInTheDocument();
    expect(trendIndicator).toHaveClass('text-destructive'); // INCREASING trend
  });

  it('should show different trend icons for different directions', () => {
    const { rerender } = render(<PatternCard pattern={mockPattern} />);
    expect(screen.getByTestId('icon-trend-up')).toBeInTheDocument();

    rerender(<PatternCard pattern={{ ...mockPattern, trendDirection: 'DECREASING' }} />);
    expect(screen.getByTestId('icon-trend-down')).toBeInTheDocument();

    rerender(<PatternCard pattern={{ ...mockPattern, trendDirection: 'STABLE' }} />);
    expect(screen.getByTestId('icon-trend-stable')).toBeInTheDocument();
  });

  it('should display complaint statistics', () => {
    render(<PatternCard pattern={mockPattern} />);

    expect(screen.getByText('150')).toBeInTheDocument(); // complaints
    expect(screen.getByText('2 deaths')).toBeInTheDocument();
    expect(screen.getByText('45 injuries')).toBeInTheDocument();
    expect(screen.getByText('78 crashes')).toBeInTheDocument();
  });

  it('should handle click event', () => {
    const onClick = vi.fn();
    render(<PatternCard pattern={mockPattern} onClick={onClick} />);

    fireEvent.click(screen.getByText('Airbag Deployment Failures'));
    expect(onClick).toHaveBeenCalledWith(mockPattern);
  });

  it('should show action buttons when showActions is true', () => {
    render(<PatternCard pattern={mockPattern} showActions />);

    expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate complaint/i })).toBeInTheDocument();
  });

  it('should call onGenerateComplaint when generate button clicked', () => {
    const onGenerate = vi.fn();
    render(<PatternCard pattern={mockPattern} showActions onGenerateComplaint={onGenerate} />);

    fireEvent.click(screen.getByRole('button', { name: /generate complaint/i }));
    expect(onGenerate).toHaveBeenCalledWith(mockPattern.id);
  });

  it('should show skeleton loader when loading', () => {
    render(<PatternCard pattern={mockPattern} isLoading />);

    expect(screen.getByTestId('pattern-card-skeleton')).toBeInTheDocument();
  });

  it('should highlight card when selected', () => {
    render(<PatternCard pattern={mockPattern} isSelected />);

    const card = screen.getByTestId('pattern-card');
    expect(card).toHaveClass('ring-2', 'ring-primary');
  });

  it('should format large complaint counts', () => {
    const patternWithMany = { ...mockPattern, complaintCount: 12500 };
    render(<PatternCard pattern={patternWithMany} />);

    expect(screen.getByText('12.5K')).toBeInTheDocument();
  });
});
