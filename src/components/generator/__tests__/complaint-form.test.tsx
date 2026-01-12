/**
 * Complaint Form Component Tests
 * Tests for legal complaint generation form
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { ComplaintForm } from '../complaint-form';

describe('ComplaintForm', () => {
  const mockPattern = {
    id: 'pattern_1',
    name: 'Airbag Deployment Failures',
    make: 'Toyota',
    model: 'RAV4',
    yearStart: 2020,
    yearEnd: 2023,
    complaintCount: 150,
  };

  const defaultProps = {
    pattern: mockPattern,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  it('should render form with pattern information', () => {
    render(<ComplaintForm {...defaultProps} />);

    expect(screen.getByText('Generate Legal Complaint')).toBeInTheDocument();
    expect(screen.getByText('Toyota RAV4')).toBeInTheDocument();
    expect(screen.getByText('Airbag Deployment Failures')).toBeInTheDocument();
  });

  it('should render plaintiff information fields', () => {
    render(<ComplaintForm {...defaultProps} />);

    expect(screen.getByLabelText('Plaintiff Name')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByLabelText('Incident Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Injury Description')).toBeInTheDocument();
  });

  it('should render court selection', () => {
    render(<ComplaintForm {...defaultProps} />);

    expect(screen.getByLabelText('Court')).toBeInTheDocument();
    // Should show at least one court option
    expect(screen.getAllByText(/US District Court/).length).toBeGreaterThan(0);
  });

  it('should validate required fields', async () => {
    render(<ComplaintForm {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByText(/plaintiff name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/state is required/i)).toBeInTheDocument();
    });
  });

  it('should call onSubmit with form data when valid', async () => {
    const onSubmit = vi.fn();
    render(<ComplaintForm {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Plaintiff Name'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByLabelText('State'), {
      target: { value: 'California' },
    });
    fireEvent.change(screen.getByLabelText('Court'), {
      target: { value: 'US District Court, Northern District of California' },
    });

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          patternId: 'pattern_1',
          plaintiffInfo: expect.objectContaining({
            name: 'John Doe',
            state: 'California',
          }),
          court: 'US District Court, Northern District of California',
        })
      );
    });
  });

  it('should call onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<ComplaintForm {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('should show loading state while generating', () => {
    render(<ComplaintForm {...defaultProps} isLoading />);

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should pre-fill form when initialData provided', () => {
    const initialData = {
      plaintiffInfo: {
        name: 'Jane Smith',
        state: 'Texas',
      },
      court: 'US District Court, Southern District of Texas',
    };
    render(<ComplaintForm {...defaultProps} initialData={initialData} />);

    expect(screen.getByLabelText('Plaintiff Name')).toHaveValue('Jane Smith');
    expect(screen.getByLabelText('State')).toHaveValue('Texas');
  });

  it('should show complaint type options', () => {
    render(<ComplaintForm {...defaultProps} />);

    expect(screen.getByText('Complaint Type')).toBeInTheDocument();
    expect(screen.getByText('Class Action')).toBeInTheDocument();
    expect(screen.getByText('Individual')).toBeInTheDocument();
  });

  it('should show additional class action fields when class action selected', () => {
    render(<ComplaintForm {...defaultProps} />);

    fireEvent.click(screen.getByText('Class Action'));

    expect(screen.getByLabelText('Proposed Class Definition')).toBeInTheDocument();
    expect(screen.getByLabelText('Estimated Class Size')).toBeInTheDocument();
  });

  it('should show error message when submission fails', () => {
    render(<ComplaintForm {...defaultProps} error="Failed to generate complaint" />);

    expect(screen.getByText('Failed to generate complaint')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should show causes of action selection', () => {
    render(<ComplaintForm {...defaultProps} />);

    expect(screen.getByText('Causes of Action')).toBeInTheDocument();
    expect(screen.getByLabelText('Negligence')).toBeInTheDocument();
    expect(screen.getByLabelText('Strict Product Liability')).toBeInTheDocument();
    expect(screen.getByLabelText('Breach of Warranty')).toBeInTheDocument();
  });

  it('should allow selecting multiple causes of action', () => {
    const onSubmit = vi.fn();
    render(<ComplaintForm {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByLabelText('Negligence'));
    fireEvent.click(screen.getByLabelText('Strict Product Liability'));

    // Fill required fields
    fireEvent.change(screen.getByLabelText('Plaintiff Name'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByLabelText('State'), {
      target: { value: 'California' },
    });

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        causesOfAction: ['negligence', 'strict_product_liability'],
      })
    );
  });
});
