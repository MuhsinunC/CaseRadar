/**
 * Generated Complaints List Component Tests
 * Tests for list of generated legal complaints
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { GeneratedList } from '../generated-list';

describe('GeneratedList', () => {
  const mockComplaints = [
    {
      id: 'gen_1',
      title: 'Class Action Complaint: Toyota RAV4 Airbag Defect',
      status: 'DRAFT' as const,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      pattern: {
        id: 'pattern_1',
        name: 'Airbag Deployment Failures',
        make: 'Toyota',
        model: 'RAV4',
      },
      plaintiffInfo: {
        name: 'John Doe',
        state: 'California',
      },
    },
    {
      id: 'gen_2',
      title: 'Class Action Complaint: Honda Accord Brake Defect',
      status: 'FINALIZED' as const,
      createdAt: new Date('2024-01-10T14:30:00Z'),
      pattern: {
        id: 'pattern_2',
        name: 'Brake System Failures',
        make: 'Honda',
        model: 'Accord',
      },
      plaintiffInfo: {
        name: 'Jane Smith',
        state: 'Texas',
      },
    },
    {
      id: 'gen_3',
      title: 'Individual Complaint: Ford F-150 Fire Risk',
      status: 'ARCHIVED' as const,
      createdAt: new Date('2024-01-05T09:15:00Z'),
      pattern: {
        id: 'pattern_3',
        name: 'Fuel System Fire Risk',
        make: 'Ford',
        model: 'F-150',
      },
      plaintiffInfo: {
        name: 'Bob Johnson',
        state: 'Florida',
      },
    },
  ];

  it('should render list of generated complaints', () => {
    render(<GeneratedList complaints={mockComplaints} />);

    expect(screen.getByText('Generated Complaints')).toBeInTheDocument();
    expect(screen.getByText(/Toyota RAV4 Airbag Defect/)).toBeInTheDocument();
    expect(screen.getByText(/Honda Accord Brake Defect/)).toBeInTheDocument();
    expect(screen.getByText(/Ford F-150 Fire Risk/)).toBeInTheDocument();
  });

  it('should display status badges with correct styling', () => {
    render(<GeneratedList complaints={mockComplaints} />);

    const draftBadge = screen.getByTestId('status-badge-gen_1');
    const finalizedBadge = screen.getByTestId('status-badge-gen_2');
    const archivedBadge = screen.getByTestId('status-badge-gen_3');

    expect(draftBadge).toHaveTextContent('DRAFT');
    expect(draftBadge).toHaveClass('bg-warning');

    expect(finalizedBadge).toHaveTextContent('FINALIZED');
    expect(finalizedBadge).toHaveClass('bg-success');

    expect(archivedBadge).toHaveTextContent('ARCHIVED');
    expect(archivedBadge).toHaveClass('bg-muted');
  });

  it('should display pattern and plaintiff information', () => {
    render(<GeneratedList complaints={mockComplaints} />);

    expect(screen.getByText('Airbag Deployment Failures')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('California')).toBeInTheDocument();
  });

  it('should show action buttons for each complaint', () => {
    render(<GeneratedList complaints={mockComplaints} />);

    // Draft complaint should have Edit, Preview, Delete
    const draftRow = screen.getByTestId('complaint-row-gen_1');
    expect(draftRow.querySelector('[aria-label="Edit"]')).toBeInTheDocument();
    expect(draftRow.querySelector('[aria-label="Preview"]')).toBeInTheDocument();
    expect(draftRow.querySelector('[aria-label="Delete"]')).toBeInTheDocument();

    // Finalized complaint should have Download, but not Edit
    const finalizedRow = screen.getByTestId('complaint-row-gen_2');
    expect(finalizedRow.querySelector('[aria-label="Download PDF"]')).toBeInTheDocument();
    expect(finalizedRow.querySelector('[aria-label="Edit"]')).not.toBeInTheDocument();
  });

  it('should handle download PDF click', () => {
    const onDownload = vi.fn();
    render(<GeneratedList complaints={mockComplaints} onDownload={onDownload} />);

    const downloadButton = screen.getByTestId('complaint-row-gen_2').querySelector('[aria-label="Download PDF"]');
    fireEvent.click(downloadButton!);

    expect(onDownload).toHaveBeenCalledWith('gen_2');
  });

  it('should handle delete click with confirmation', async () => {
    const onDelete = vi.fn();
    render(<GeneratedList complaints={mockComplaints} onDelete={onDelete} />);

    const deleteButton = screen.getByTestId('complaint-row-gen_1').querySelector('[aria-label="Delete"]');
    fireEvent.click(deleteButton!);

    // Confirmation dialog should appear
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onDelete).toHaveBeenCalledWith('gen_1');
  });

  it('should filter by status', () => {
    render(<GeneratedList complaints={mockComplaints} />);

    const statusFilter = screen.getByLabelText('Filter by status');
    fireEvent.change(statusFilter, { target: { value: 'DRAFT' } });

    // DRAFT row should still be visible
    expect(screen.getByTestId('complaint-row-gen_1')).toBeInTheDocument();
    // FINALIZED and ARCHIVED rows should be filtered out
    expect(screen.queryByTestId('complaint-row-gen_2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('complaint-row-gen_3')).not.toBeInTheDocument();
  });

  it('should show empty state when no complaints', () => {
    render(<GeneratedList complaints={[]} />);

    expect(screen.getByText('No generated complaints')).toBeInTheDocument();
    expect(screen.getByText(/generate your first complaint/i)).toBeInTheDocument();
  });

  it('should show loading state', () => {
    render(<GeneratedList complaints={[]} isLoading />);

    const skeletons = screen.getAllByTestId('complaint-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should handle row click for details', () => {
    const onView = vi.fn();
    render(<GeneratedList complaints={mockComplaints} onView={onView} />);

    fireEvent.click(screen.getByText(/Toyota RAV4 Airbag Defect/));
    expect(onView).toHaveBeenCalledWith('gen_1');
  });

  it('should sort by date (newest first by default)', () => {
    render(<GeneratedList complaints={mockComplaints} />);

    const rows = screen.getAllByTestId(/^complaint-row-/);
    expect(rows[0]).toHaveAttribute('data-testid', 'complaint-row-gen_1');
    expect(rows[1]).toHaveAttribute('data-testid', 'complaint-row-gen_2');
    expect(rows[2]).toHaveAttribute('data-testid', 'complaint-row-gen_3');
  });

  it('should allow sorting by different columns', () => {
    const onSort = vi.fn();
    render(<GeneratedList complaints={mockComplaints} onSort={onSort} />);

    fireEvent.click(screen.getByText('Status'));
    expect(onSort).toHaveBeenCalledWith({ field: 'status', direction: 'asc' });
  });

  it('should show bulk actions when items selected', () => {
    // Use controlled state via selectedIds prop
    render(
      <GeneratedList
        complaints={mockComplaints}
        selectable
        selectedIds={['gen_1']}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByTestId('bulk-actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bulk delete/i })).toBeInTheDocument();
  });
});
