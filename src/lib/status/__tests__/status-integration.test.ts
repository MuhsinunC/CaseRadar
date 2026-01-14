/**
 * Status Page Integration Tests
 * P3-2 Implementation - TDD
 *
 * Tests for public status page integration including incident reporting,
 * component status management, and health check integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reportIncident,
  updateComponentStatus,
  getComponentStatuses,
  resolveIncident,
  getActiveIncidents,
  IncidentStatus,
  ComponentStatus,
  COMPONENTS,
  clearStatusStore,
  runHealthCheckWithStatusUpdate,
} from '../status-integration';

describe('Status Page Integration', () => {
  beforeEach(() => {
    clearStatusStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearStatusStore();
  });

  describe('Component Definitions', () => {
    it('should define API component', () => {
      expect(COMPONENTS.api).toBeDefined();
      expect(COMPONENTS.api.name).toBe('API');
    });

    it('should define Web App component', () => {
      expect(COMPONENTS.web).toBeDefined();
      expect(COMPONENTS.web.name).toBe('Web Application');
    });

    it('should define Database component', () => {
      expect(COMPONENTS.database).toBeDefined();
      expect(COMPONENTS.database.name).toBe('Database');
    });

    it('should define AI Services component', () => {
      expect(COMPONENTS.ai).toBeDefined();
      expect(COMPONENTS.ai.name).toBe('AI Services');
    });

    it('should have all required component fields', () => {
      for (const [key, component] of Object.entries(COMPONENTS)) {
        expect(component.name).toBeDefined();
        expect(component.description).toBeDefined();
      }
    });
  });

  describe('reportIncident', () => {
    it('should create incident via API', async () => {
      const incident = await reportIncident({
        title: 'API Degradation',
        body: 'Investigating slow response times',
        status: 'investigating',
        affectedComponents: ['api'],
      });

      expect(incident.id).toBeDefined();
      expect(incident.title).toBe('API Degradation');
      expect(incident.status).toBe('investigating');
    });

    it('should set default status to investigating', async () => {
      const incident = await reportIncident({
        title: 'Issue detected',
        body: 'Looking into it',
        affectedComponents: ['web'],
      });

      expect(incident.status).toBe('investigating');
    });

    it('should track affected components', async () => {
      const incident = await reportIncident({
        title: 'Multiple systems affected',
        body: 'Database and API issues',
        status: 'investigating',
        affectedComponents: ['api', 'database'],
      });

      expect(incident.affectedComponents).toContain('api');
      expect(incident.affectedComponents).toContain('database');
    });

    it('should include timestamp', async () => {
      const incident = await reportIncident({
        title: 'Test incident',
        body: 'Test body',
        status: 'investigating',
        affectedComponents: ['api'],
      });

      expect(incident.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('updateComponentStatus', () => {
    it('should update component status', async () => {
      await updateComponentStatus({
        component: 'api',
        status: 'degraded_performance',
      });

      const statuses = await getComponentStatuses();
      expect(statuses.api).toBe('degraded_performance');
    });

    it('should support operational status', async () => {
      await updateComponentStatus({
        component: 'web',
        status: 'operational',
      });

      const statuses = await getComponentStatuses();
      expect(statuses.web).toBe('operational');
    });

    it('should support partial_outage status', async () => {
      await updateComponentStatus({
        component: 'database',
        status: 'partial_outage',
      });

      const statuses = await getComponentStatuses();
      expect(statuses.database).toBe('partial_outage');
    });

    it('should support major_outage status', async () => {
      await updateComponentStatus({
        component: 'ai',
        status: 'major_outage',
      });

      const statuses = await getComponentStatuses();
      expect(statuses.ai).toBe('major_outage');
    });

    it('should track status change timestamp', async () => {
      const result = await updateComponentStatus({
        component: 'api',
        status: 'degraded_performance',
      });

      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('getComponentStatuses', () => {
    it('should return all component statuses', async () => {
      const statuses = await getComponentStatuses();

      expect(statuses).toHaveProperty('api');
      expect(statuses).toHaveProperty('web');
      expect(statuses).toHaveProperty('database');
      expect(statuses).toHaveProperty('ai');
    });

    it('should default to operational', async () => {
      const statuses = await getComponentStatuses();

      expect(statuses.api).toBe('operational');
      expect(statuses.web).toBe('operational');
    });
  });

  describe('resolveIncident', () => {
    it('should resolve an incident', async () => {
      const incident = await reportIncident({
        title: 'Test incident',
        body: 'Test',
        status: 'investigating',
        affectedComponents: ['api'],
      });

      const resolved = await resolveIncident({
        incidentId: incident.id,
        resolutionMessage: 'Issue has been resolved',
      });

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
    });

    it('should reset affected component statuses', async () => {
      await updateComponentStatus({
        component: 'api',
        status: 'degraded_performance',
      });

      const incident = await reportIncident({
        title: 'API Issue',
        body: 'Test',
        status: 'investigating',
        affectedComponents: ['api'],
      });

      await resolveIncident({
        incidentId: incident.id,
        resolutionMessage: 'Fixed',
        resetComponentStatus: true,
      });

      const statuses = await getComponentStatuses();
      expect(statuses.api).toBe('operational');
    });
  });

  describe('getActiveIncidents', () => {
    it('should return active incidents', async () => {
      await reportIncident({
        title: 'Active incident',
        body: 'Still ongoing',
        status: 'investigating',
        affectedComponents: ['api'],
      });

      const active = await getActiveIncidents();

      expect(active.length).toBe(1);
      expect(active[0].title).toBe('Active incident');
    });

    it('should not include resolved incidents', async () => {
      const incident = await reportIncident({
        title: 'Resolved incident',
        body: 'Was an issue',
        status: 'investigating',
        affectedComponents: ['api'],
      });

      await resolveIncident({
        incidentId: incident.id,
        resolutionMessage: 'Fixed',
      });

      const active = await getActiveIncidents();
      expect(active.length).toBe(0);
    });
  });

  describe('Auto-status from health checks', () => {
    it('should update status when health check fails', async () => {
      // Simulate health check failure
      await runHealthCheckWithStatusUpdate({
        component: 'api',
        healthy: false,
        message: 'API not responding',
      });

      const statuses = await getComponentStatuses();
      expect(statuses.api).not.toBe('operational');
    });

    it('should keep operational when health check passes', async () => {
      await runHealthCheckWithStatusUpdate({
        component: 'api',
        healthy: true,
      });

      const statuses = await getComponentStatuses();
      expect(statuses.api).toBe('operational');
    });

    it('should create incident on health check failure', async () => {
      await runHealthCheckWithStatusUpdate({
        component: 'database',
        healthy: false,
        message: 'Database connection failed',
        createIncident: true,
      });

      const incidents = await getActiveIncidents();
      expect(incidents.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown component gracefully', async () => {
      const result = await updateComponentStatus({
        component: 'unknown' as 'api',
        status: 'operational',
      });

      expect(result.success).toBe(false);
    });

    it('should handle concurrent status updates', async () => {
      const updates = [
        updateComponentStatus({ component: 'api', status: 'degraded_performance' }),
        updateComponentStatus({ component: 'web', status: 'partial_outage' }),
        updateComponentStatus({ component: 'database', status: 'operational' }),
      ];

      await Promise.all(updates);

      const statuses = await getComponentStatuses();
      expect(statuses.api).toBe('degraded_performance');
      expect(statuses.web).toBe('partial_outage');
      expect(statuses.database).toBe('operational');
    });
  });
});
