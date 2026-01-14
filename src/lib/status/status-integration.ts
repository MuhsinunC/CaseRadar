/**
 * Status Page Integration
 * P3-2 Implementation
 *
 * Provides integration with status page for incident reporting,
 * component status management, and health check integration.
 */

/**
 * Component keys
 */
export type ComponentKey = 'api' | 'web' | 'database' | 'ai';

/**
 * Incident status
 */
export type IncidentStatus =
  | 'investigating'
  | 'identified'
  | 'monitoring'
  | 'resolved';

/**
 * Component status
 */
export type ComponentStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'under_maintenance';

/**
 * Component definition
 */
export interface ComponentDefinition {
  name: string;
  description: string;
}

/**
 * Component definitions
 */
export const COMPONENTS: Record<ComponentKey, ComponentDefinition> = {
  api: {
    name: 'API',
    description: 'REST and GraphQL API endpoints',
  },
  web: {
    name: 'Web Application',
    description: 'Dashboard and user interface',
  },
  database: {
    name: 'Database',
    description: 'Data storage and retrieval',
  },
  ai: {
    name: 'AI Services',
    description: 'OpenAI and Anthropic integrations',
  },
};

/**
 * Incident
 */
export interface Incident {
  id: string;
  title: string;
  body: string;
  status: IncidentStatus;
  affectedComponents: ComponentKey[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolutionMessage?: string;
}

/**
 * Component status entry
 */
interface ComponentStatusEntry {
  status: ComponentStatus;
  updatedAt: Date;
}

/**
 * In-memory storage
 */
const incidents: Incident[] = [];
const componentStatuses: Map<ComponentKey, ComponentStatusEntry> = new Map();
let incidentCounter = 0;

/**
 * Initialize default statuses
 */
function initializeDefaults(): void {
  for (const key of Object.keys(COMPONENTS) as ComponentKey[]) {
    if (!componentStatuses.has(key)) {
      componentStatuses.set(key, {
        status: 'operational',
        updatedAt: new Date(),
      });
    }
  }
}

// Initialize on module load
initializeDefaults();

/**
 * Clear status store (for testing)
 */
export function clearStatusStore(): void {
  incidents.length = 0;
  componentStatuses.clear();
  incidentCounter = 0;
  initializeDefaults();
}

/**
 * Report incident params
 */
export interface ReportIncidentParams {
  title: string;
  body: string;
  status?: IncidentStatus;
  affectedComponents: ComponentKey[];
}

/**
 * Report a new incident
 */
export async function reportIncident(
  params: ReportIncidentParams
): Promise<Incident> {
  const id = `incident_${Date.now()}_${++incidentCounter}`;
  const now = new Date();

  const incident: Incident = {
    id,
    title: params.title,
    body: params.body,
    status: params.status || 'investigating',
    affectedComponents: params.affectedComponents,
    createdAt: now,
    updatedAt: now,
  };

  incidents.push(incident);

  return incident;
}

/**
 * Update component status params
 */
export interface UpdateComponentStatusParams {
  component: ComponentKey;
  status: ComponentStatus;
}

/**
 * Update component status result
 */
export interface UpdateComponentStatusResult {
  success: boolean;
  component: ComponentKey;
  status: ComponentStatus;
  updatedAt: Date;
}

/**
 * Update component status
 */
export async function updateComponentStatus(
  params: UpdateComponentStatusParams
): Promise<UpdateComponentStatusResult> {
  const { component, status } = params;

  // Validate component exists
  if (!COMPONENTS[component]) {
    return {
      success: false,
      component,
      status,
      updatedAt: new Date(),
    };
  }

  const now = new Date();
  componentStatuses.set(component, {
    status,
    updatedAt: now,
  });

  return {
    success: true,
    component,
    status,
    updatedAt: now,
  };
}

/**
 * Get all component statuses
 */
export async function getComponentStatuses(): Promise<
  Record<ComponentKey, ComponentStatus>
> {
  const result: Record<ComponentKey, ComponentStatus> = {} as Record<
    ComponentKey,
    ComponentStatus
  >;

  for (const key of Object.keys(COMPONENTS) as ComponentKey[]) {
    const entry = componentStatuses.get(key);
    result[key] = entry?.status || 'operational';
  }

  return result;
}

/**
 * Resolve incident params
 */
export interface ResolveIncidentParams {
  incidentId: string;
  resolutionMessage: string;
  resetComponentStatus?: boolean;
}

/**
 * Resolve an incident
 */
export async function resolveIncident(
  params: ResolveIncidentParams
): Promise<Incident> {
  const { incidentId, resolutionMessage, resetComponentStatus } = params;

  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  const now = new Date();
  incident.status = 'resolved';
  incident.updatedAt = now;
  incident.resolvedAt = now;
  incident.resolutionMessage = resolutionMessage;

  // Optionally reset affected component statuses
  if (resetComponentStatus) {
    for (const component of incident.affectedComponents) {
      await updateComponentStatus({
        component,
        status: 'operational',
      });
    }
  }

  return incident;
}

/**
 * Get active incidents (non-resolved)
 */
export async function getActiveIncidents(): Promise<Incident[]> {
  return incidents.filter((i) => i.status !== 'resolved');
}

/**
 * Health check params
 */
export interface HealthCheckParams {
  component: ComponentKey;
  healthy: boolean;
  message?: string;
  createIncident?: boolean;
}

/**
 * Run health check with status update
 */
export async function runHealthCheckWithStatusUpdate(
  params: HealthCheckParams
): Promise<void> {
  const { component, healthy, message, createIncident } = params;

  if (healthy) {
    // Component is healthy, ensure operational status
    await updateComponentStatus({
      component,
      status: 'operational',
    });
  } else {
    // Component is unhealthy, update status
    await updateComponentStatus({
      component,
      status: 'degraded_performance',
    });

    // Optionally create an incident
    if (createIncident) {
      await reportIncident({
        title: `${COMPONENTS[component].name} Issue Detected`,
        body: message || 'Automated health check detected an issue',
        status: 'investigating',
        affectedComponents: [component],
      });
    }
  }
}

/**
 * Get incident history
 */
export async function getIncidentHistory(
  options: { limit?: number } = {}
): Promise<Incident[]> {
  const { limit = 100 } = options;
  return incidents.slice(-limit).reverse();
}

/**
 * Update incident status
 */
export async function updateIncidentStatus(
  incidentId: string,
  status: IncidentStatus,
  message?: string
): Promise<Incident> {
  const incident = incidents.find((i) => i.id === incidentId);
  if (!incident) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  incident.status = status;
  incident.updatedAt = new Date();
  if (message) {
    incident.body = `${incident.body}\n\nUpdate: ${message}`;
  }

  return incident;
}
