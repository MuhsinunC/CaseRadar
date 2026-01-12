/**
 * Alerts Panel Component Tests
 * Tests for dashboard alerts and notifications panel
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { AlertsPanel } from '../alerts-panel';

describe('AlertsPanel', () => {
  const mockAlerts = [
    {
      id: 'pattern-limit-critical',
      type: 'critical' as const,
      title: 'Pattern Limit Almost Reached',
      message: "You've used 95 of 100 patterns (95%)",
      action: { label: 'Upgrade Plan', href: '/settings/billing' },
    },
    {
      id: 'high-severity-patterns',
      type: 'warning' as const,
      title: 'High-Severity Patterns Trending Up',
      message: '3 pattern(s) with severity ≥8 are showing upward trends',
      action: { label: 'View Patterns', href: '/patterns?minSeverity=8' },
    },
    {
      id: 'draft-complaints',
      type: 'info' as const,
      title: 'Draft Complaints Pending',
      message: 'You have 10 draft complaints awaiting review',
      action: { label: 'Review Drafts', href: '/generator?status=DRAFT' },
    },
  ];

  it('should render all alerts', () => {
    render(<AlertsPanel alerts={mockAlerts} />);

    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('Pattern Limit Almost Reached')).toBeInTheDocument();
    expect(screen.getByText('High-Severity Patterns Trending Up')).toBeInTheDocument();
    expect(screen.getByText('Draft Complaints Pending')).toBeInTheDocument();
  });

  it('should display alert messages', () => {
    render(<AlertsPanel alerts={mockAlerts} />);

    expect(screen.getByText(/95 of 100 patterns/)).toBeInTheDocument();
    expect(screen.getByText(/3 pattern\(s\) with severity/)).toBeInTheDocument();
    expect(screen.getByText(/10 draft complaints/)).toBeInTheDocument();
  });

  it('should apply correct styling based on alert type', () => {
    render(<AlertsPanel alerts={mockAlerts} />);

    const criticalAlert = screen.getByTestId('alert-pattern-limit-critical');
    const warningAlert = screen.getByTestId('alert-high-severity-patterns');
    const infoAlert = screen.getByTestId('alert-draft-complaints');

    expect(criticalAlert).toHaveClass('bg-destructive/10');
    expect(warningAlert).toHaveClass('bg-warning/10');
    expect(infoAlert).toHaveClass('bg-info/10');
  });

  it('should render action buttons with correct links', () => {
    render(<AlertsPanel alerts={mockAlerts} />);

    const upgradeLink = screen.getByRole('link', { name: 'Upgrade Plan' });
    expect(upgradeLink).toHaveAttribute('href', '/settings/billing');

    const viewPatternsLink = screen.getByRole('link', { name: 'View Patterns' });
    expect(viewPatternsLink).toHaveAttribute('href', '/patterns?minSeverity=8');
  });

  it('should show empty state when no alerts', () => {
    render(<AlertsPanel alerts={[]} />);

    expect(screen.getByText('No alerts')).toBeInTheDocument();
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<AlertsPanel alerts={[]} isLoading />);

    const skeletons = screen.getAllByTestId('alert-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should allow dismissing alerts', () => {
    const onDismiss = vi.fn();
    render(<AlertsPanel alerts={mockAlerts} onDismiss={onDismiss} />);

    const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButtons[0]);

    expect(onDismiss).toHaveBeenCalledWith('pattern-limit-critical');
  });

  it('should show alert count badge', () => {
    render(<AlertsPanel alerts={mockAlerts} />);

    expect(screen.getByTestId('alerts-count-badge')).toHaveTextContent('3');
  });

  it('should sort alerts by severity (critical first)', () => {
    const mixedAlerts = [
      { ...mockAlerts[2] }, // info
      { ...mockAlerts[0] }, // critical
      { ...mockAlerts[1] }, // warning
    ];
    render(<AlertsPanel alerts={mixedAlerts} />);

    // Get alert items (badge is now alerts-count-badge, so this won't match it)
    const alertItems = screen.getAllByTestId(/^alert-/);
    // First alert should be critical
    expect(alertItems[0]).toHaveAttribute('data-testid', 'alert-pattern-limit-critical');
  });
});
