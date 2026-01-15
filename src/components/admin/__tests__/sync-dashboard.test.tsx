/**
 * Sync Dashboard Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncDashboard } from '../sync-dashboard';
import { server } from '@/test/mocks/server';
import { http, HttpResponse } from 'msw';

describe('SyncDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('initial render', () => {
    it('should render the dashboard', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({ status: 'idle', message: 'No import in progress' });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('sync-dashboard')).toBeInTheDocument();
      });
    });

    it('should show idle status when no import is running', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({ status: 'idle', message: 'No import in progress' });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Idle');
      });
    });

    it('should display the start import button', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({ status: 'idle' });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('start-import-btn')).toBeInTheDocument();
      });
    });
  });

  describe('start import', () => {
    it('should start import when button is clicked', async () => {
      let postCalled = false;

      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({ status: 'idle' });
        }),
        http.post('/api/nhtsa/bulk-import', () => {
          postCalled = true;
          return HttpResponse.json({ success: true, status: 'downloading' });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('start-import-btn')).toBeEnabled();
      });

      fireEvent.click(screen.getByTestId('start-import-btn'));

      await waitFor(() => {
        expect(postCalled).toBe(true);
      });
    });
  });

  describe('import in progress', () => {
    it('should show progress when import is running', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({
            status: 'importing',
            progress: {
              recordsProcessed: 50000,
              recordsInserted: 48000,
              recordsSkipped: 1500,
              recordsErrored: 500,
              batchNumber: 50,
              estimatedTotal: 2200000,
              percentComplete: 2,
              startTime: new Date().toISOString(),
              elapsedMs: 60000,
              recordsPerSecond: 833,
            },
          });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Importing');
        expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
        expect(screen.getByTestId('progress-stats')).toBeInTheDocument();
      });
    });

    it('should show cancel button during import', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({
            status: 'importing',
            progress: {
              recordsProcessed: 50000,
              recordsInserted: 48000,
              recordsSkipped: 1500,
              recordsErrored: 500,
              batchNumber: 50,
              estimatedTotal: 2200000,
              percentComplete: 2,
              startTime: new Date().toISOString(),
              elapsedMs: 60000,
              recordsPerSecond: 833,
            },
          });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-import-btn')).toBeInTheDocument();
      });
    });
  });

  describe('import complete', () => {
    it('should show result summary when import is complete', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({
            status: 'complete',
            result: {
              success: true,
              recordsProcessed: 2100000,
              recordsInserted: 2050000,
              recordsSkipped: 45000,
              recordsErrored: 5000,
              durationMs: 7200000,
              errors: [],
            },
          });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Complete');
        expect(screen.getByTestId('result-summary')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should display error message when fetch fails', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.error();
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    it('should show error status when import fails', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({
            status: 'error',
            error: 'Download failed',
            result: {
              success: false,
              recordsProcessed: 100000,
              recordsInserted: 95000,
              recordsSkipped: 4000,
              recordsErrored: 1000,
              durationMs: 300000,
              errors: ['Download failed: Connection timeout'],
            },
          });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Error');
      });
    });
  });

  describe('refresh', () => {
    it('should have a refresh button', async () => {
      server.use(
        http.get('/api/nhtsa/bulk-import', () => {
          return HttpResponse.json({ status: 'idle' });
        })
      );

      render(<SyncDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('refresh-btn')).toBeInTheDocument();
      });
    });
  });
});
