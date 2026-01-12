/**
 * Complaint Table Component Tests
 * Tests for NHTSA complaint data table
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@/test/test-utils';
import { ComplaintTable } from '../complaint-table';

describe('ComplaintTable', () => {
  const mockComplaints = [
    {
      id: 'complaint_1',
      nhtsaId: 'NHTSA_123456',
      make: 'Toyota',
      model: 'RAV4',
      year: 2021,
      component: 'AIR BAGS',
      description: 'Airbag failed to deploy during collision',
      crash: true,
      fire: false,
      injuries: 2,
      deaths: 0,
      dateAdded: new Date('2024-01-15'),
    },
    {
      id: 'complaint_2',
      nhtsaId: 'NHTSA_789012',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      component: 'SERVICE BRAKES',
      description: 'Brake pedal went to floor without warning',
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      dateAdded: new Date('2024-01-14'),
    },
    {
      id: 'complaint_3',
      nhtsaId: 'NHTSA_345678',
      make: 'Ford',
      model: 'F-150',
      year: 2022,
      component: 'FUEL SYSTEM',
      description: 'Vehicle caught fire while parked',
      crash: false,
      fire: true,
      injuries: 0,
      deaths: 1,
      dateAdded: new Date('2024-01-13'),
    },
  ];

  it('should render table with all complaints', () => {
    render(<ComplaintTable complaints={mockComplaints} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Toyota')).toBeInTheDocument();
    expect(screen.getByText('Honda')).toBeInTheDocument();
    expect(screen.getByText('Ford')).toBeInTheDocument();
  });

  it('should display all table columns', () => {
    render(<ComplaintTable complaints={mockComplaints} />);

    expect(screen.getByText('NHTSA ID')).toBeInTheDocument();
    expect(screen.getByText('Make')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Year')).toBeInTheDocument();
    expect(screen.getByText('Component')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('should show severity indicators for crash, fire, injury, death', () => {
    render(<ComplaintTable complaints={mockComplaints} />);

    // Toyota RAV4 has crash and injuries
    const toyotaRow = screen.getByText('Toyota').closest('tr');
    expect(within(toyotaRow!).getByTestId('severity-crash')).toBeInTheDocument();
    expect(within(toyotaRow!).getByTestId('severity-injuries')).toBeInTheDocument();

    // Ford F-150 has fire and death
    const fordRow = screen.getByText('Ford').closest('tr');
    expect(within(fordRow!).getByTestId('severity-fire')).toBeInTheDocument();
    expect(within(fordRow!).getByTestId('severity-deaths')).toBeInTheDocument();
  });

  it('should handle row selection', () => {
    const onSelect = vi.fn();
    render(<ComplaintTable complaints={mockComplaints} onSelect={onSelect} selectable />);

    const checkbox = screen.getAllByRole('checkbox')[1]; // Skip header checkbox
    fireEvent.click(checkbox);

    expect(onSelect).toHaveBeenCalledWith(['complaint_1']);
  });

  it('should handle select all', () => {
    const onSelect = vi.fn();
    render(<ComplaintTable complaints={mockComplaints} onSelect={onSelect} selectable />);

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);

    expect(onSelect).toHaveBeenCalledWith(['complaint_1', 'complaint_2', 'complaint_3']);
  });

  it('should handle row click for details', () => {
    const onRowClick = vi.fn();
    render(<ComplaintTable complaints={mockComplaints} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByText('Toyota'));
    expect(onRowClick).toHaveBeenCalledWith(mockComplaints[0]);
  });

  it('should sort by column when header clicked', () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <ComplaintTable complaints={mockComplaints} onSort={onSort} />
    );

    // First click on Year - should sort ascending
    fireEvent.click(screen.getByText('Year'));
    expect(onSort).toHaveBeenCalledWith({ field: 'year', direction: 'asc' });

    // Update with sortConfig to simulate controlled state
    rerender(
      <ComplaintTable
        complaints={mockComplaints}
        onSort={onSort}
        sortConfig={{ field: 'year', direction: 'asc' }}
      />
    );

    // Second click on Year - should toggle to descending
    fireEvent.click(screen.getByText('Year'));
    expect(onSort).toHaveBeenCalledWith({ field: 'year', direction: 'desc' });
  });

  it('should show loading state', () => {
    render(<ComplaintTable complaints={[]} isLoading />);

    const skeletons = screen.getAllByTestId('table-row-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no complaints', () => {
    render(<ComplaintTable complaints={[]} />);

    expect(screen.getByText('No complaints found')).toBeInTheDocument();
  });

  it('should truncate long descriptions', () => {
    const longDescription = 'A'.repeat(200);
    const complaints = [{ ...mockComplaints[0], description: longDescription }];
    render(<ComplaintTable complaints={complaints} />);

    const descriptionCell = screen.getByTestId('description-complaint_1');
    expect(descriptionCell.textContent?.length).toBeLessThan(200);
  });

  it('should format dates correctly', () => {
    render(<ComplaintTable complaints={mockComplaints} />);

    // Check that dates are formatted with MMM d, yyyy format
    // The exact date may vary due to timezone, so check for the pattern
    expect(screen.getByText(/Jan 1[4-6], 2024/)).toBeInTheDocument();
  });
});
