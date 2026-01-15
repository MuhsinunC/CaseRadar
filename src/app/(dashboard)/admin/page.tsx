/**
 * Admin Page
 * System administration features including NHTSA data sync and pattern generation
 */

import { Metadata } from 'next';
import { SyncDashboard, PipelineDashboard } from '@/components/admin';

export const metadata: Metadata = {
  title: 'Admin | CaseRadar',
  description: 'System administration and data sync',
};

export default function AdminPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8" data-testid="admin-page">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin</h2>
          <p className="text-muted-foreground">
            System administration and NHTSA data sync
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <SyncDashboard />
        <PipelineDashboard />
      </div>
    </div>
  );
}
