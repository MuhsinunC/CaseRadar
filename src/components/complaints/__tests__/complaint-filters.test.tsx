/**
 * Complaint Filters Component Tests
 * Tests for complaint search and filter controls
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { ComplaintFilters } from '../complaint-filters';

describe('ComplaintFilters', () => {
  const defaultFilters = {
    search: '',
    make: '',
    model: '',
    yearFrom: undefined as number | undefined,
    yearTo: undefined as number | undefined,
    component: '',
    hasCrash: false,
    hasFire: false,
    hasInjury: false,
    hasDeath: false,
  };

  it('should render all filter controls', () => {
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('Search complaints...')).toBeInTheDocument();
    expect(screen.getByLabelText('Make')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Year From')).toBeInTheDocument();
    expect(screen.getByLabelText('Year To')).toBeInTheDocument();
    expect(screen.getByLabelText('Component')).toBeInTheDocument();
  });

  it('should render severity filter checkboxes', () => {
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={vi.fn()} />);

    expect(screen.getByLabelText('Crash')).toBeInTheDocument();
    expect(screen.getByLabelText('Fire')).toBeInTheDocument();
    expect(screen.getByLabelText('Injuries')).toBeInTheDocument();
    expect(screen.getByLabelText('Deaths')).toBeInTheDocument();
  });

  it('should call onFiltersChange when search input changes', async () => {
    const onFiltersChange = vi.fn();
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    const searchInput = screen.getByPlaceholderText('Search complaints...');
    fireEvent.change(searchInput, { target: { value: 'airbag' } });

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'airbag' })
      );
    });
  });

  it('should debounce search input', async () => {
    const onFiltersChange = vi.fn();
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={onFiltersChange} debounceMs={300} />);

    const searchInput = screen.getByPlaceholderText('Search complaints...');

    // Type multiple characters quickly
    fireEvent.change(searchInput, { target: { value: 'a' } });
    fireEvent.change(searchInput, { target: { value: 'ai' } });
    fireEvent.change(searchInput, { target: { value: 'air' } });
    fireEvent.change(searchInput, { target: { value: 'airb' } });

    // Should only call once after debounce
    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'airb' })
      );
    }, { timeout: 500 });
  });

  it('should update make filter on selection', () => {
    const onFiltersChange = vi.fn();
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    const makeSelect = screen.getByLabelText('Make');
    fireEvent.change(makeSelect, { target: { value: 'Toyota' } });

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ make: 'Toyota' })
    );
  });

  it('should update severity filters on checkbox toggle', () => {
    const onFiltersChange = vi.fn();
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={onFiltersChange} />);

    const crashCheckbox = screen.getByLabelText('Crash');
    fireEvent.click(crashCheckbox);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasCrash: true })
    );
  });

  it('should show active filter count badge', () => {
    const activeFilters = {
      ...defaultFilters,
      make: 'Toyota',
      hasCrash: true,
      hasDeath: true,
    };
    render(<ComplaintFilters filters={activeFilters} onFiltersChange={vi.fn()} />);

    expect(screen.getByTestId('active-filters-badge')).toHaveTextContent('3');
  });

  it('should clear all filters when clear button clicked', () => {
    const onFiltersChange = vi.fn();
    const activeFilters = {
      ...defaultFilters,
      make: 'Toyota',
      search: 'airbag',
      hasCrash: true,
    };
    render(<ComplaintFilters filters={activeFilters} onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(defaultFilters);
  });

  it('should validate year range (from <= to)', () => {
    const onFiltersChange = vi.fn();
    const filtersWithYears = {
      ...defaultFilters,
      yearFrom: 2022,
      yearTo: 2020,
    };
    render(<ComplaintFilters filters={filtersWithYears} onFiltersChange={onFiltersChange} />);

    expect(screen.getByText(/year range invalid/i)).toBeInTheDocument();
  });

  it('should show quick filter presets', () => {
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={vi.fn()} showPresets />);

    expect(screen.getByRole('button', { name: /high severity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /with deaths/i })).toBeInTheDocument();
  });

  it('should apply preset filter on click', () => {
    const onFiltersChange = vi.fn();
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={onFiltersChange} showPresets />);

    fireEvent.click(screen.getByRole('button', { name: /with deaths/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasDeath: true })
    );
  });

  it('should have filter toggle button', () => {
    render(<ComplaintFilters filters={defaultFilters} onFiltersChange={vi.fn()} />);

    // Filter toggle exists for mobile view
    expect(screen.getByTestId('filter-toggle')).toBeInTheDocument();

    // Toggle button should toggle expansion state
    fireEvent.click(screen.getByTestId('filter-toggle'));
    // Note: CSS media query visibility is tested via E2E tests
    expect(screen.getByLabelText('Make')).toBeInTheDocument();
  });
});
