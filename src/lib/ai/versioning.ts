/**
 * AI Version Tracking
 * P1-5 Implementation
 *
 * Provides utilities for tracking AI model versions and prompt templates
 * to ensure reproducibility and audit trails for generated content.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * AI Version data for recording
 */
export interface AIVersionData {
  modelProvider: string;
  modelVersion: string;
  promptVersion: string;
  promptHash: string;
  embeddingModel: string;
  parameters?: Record<string, unknown>;
}

/**
 * AI Version record from database
 */
export interface AIVersionRecord extends AIVersionData {
  id: string;
  createdAt: Date;
}

/**
 * Default AI configuration
 */
const DEFAULT_AI_CONFIG = {
  modelProvider: 'anthropic',
  modelVersion: 'claude-3-sonnet-20240229',
  promptVersion: 'v1.0.0',
  embeddingModel: 'text-embedding-3-small',
};

/**
 * Default prompt template for complaint generation
 */
const DEFAULT_PROMPT_TEMPLATE = `
You are a legal assistant helping to generate consumer complaint documents.
Based on the provided pattern information and plaintiff details, generate a well-structured
legal complaint that follows standard formatting conventions.

Include the following sections:
1. Caption with court information
2. Introduction with parties
3. Jurisdiction and venue
4. Factual allegations
5. Causes of action
6. Prayer for relief
7. Demand for jury trial (if applicable)
`;

/**
 * Compute SHA-256 hash of a prompt template
 */
export function computePromptHash(template: string): string {
  return crypto.createHash('sha256').update(template).digest('hex');
}

/**
 * Get the current AI version configuration
 * Returns the active model and prompt versions for new generations
 */
export async function getCurrentAIVersion(): Promise<AIVersionData> {
  const promptHash = computePromptHash(DEFAULT_PROMPT_TEMPLATE);

  return {
    modelProvider: DEFAULT_AI_CONFIG.modelProvider,
    modelVersion: DEFAULT_AI_CONFIG.modelVersion,
    promptVersion: DEFAULT_AI_CONFIG.promptVersion,
    promptHash,
    embeddingModel: DEFAULT_AI_CONFIG.embeddingModel,
  };
}

/**
 * Record an AI version in the database
 * Uses deduplication to avoid creating duplicate records
 *
 * @param data - AI version data to record
 * @returns The created or existing AIVersion record
 */
export async function recordAIVersion(
  data: AIVersionData
): Promise<AIVersionRecord> {
  // Check for existing version with same configuration
  const existing = await prisma.aIVersion.findFirst({
    where: {
      modelProvider: data.modelProvider,
      modelVersion: data.modelVersion,
      promptVersion: data.promptVersion,
      promptHash: data.promptHash,
      embeddingModel: data.embeddingModel,
    },
  });

  if (existing) {
    return {
      id: existing.id,
      modelProvider: existing.modelProvider,
      modelVersion: existing.modelVersion,
      promptVersion: existing.promptVersion,
      promptHash: existing.promptHash,
      embeddingModel: existing.embeddingModel,
      parameters: existing.parameters as Record<string, unknown> | undefined,
      createdAt: existing.createdAt,
    };
  }

  // Create new version record
  const created = await prisma.aIVersion.create({
    data: {
      modelProvider: data.modelProvider,
      modelVersion: data.modelVersion,
      promptVersion: data.promptVersion,
      promptHash: data.promptHash,
      embeddingModel: data.embeddingModel,
      parameters: data.parameters
        ? (data.parameters as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  return {
    id: created.id,
    modelProvider: created.modelProvider,
    modelVersion: created.modelVersion,
    promptVersion: created.promptVersion,
    promptHash: created.promptHash,
    embeddingModel: created.embeddingModel,
    parameters: created.parameters as Record<string, unknown> | undefined,
    createdAt: created.createdAt,
  };
}

/**
 * Get the AI version used for a specific generation
 *
 * @param generationId - The ID of the generated complaint
 * @returns The AI version record or null if not found
 */
export async function getVersionForGeneration(
  generationId: string
): Promise<AIVersionRecord | null> {
  const generation = await prisma.generatedComplaint.findUnique({
    where: { id: generationId },
    include: { aiVersion: true },
  });

  if (!generation?.aiVersion) {
    return null;
  }

  const version = generation.aiVersion;
  return {
    id: version.id,
    modelProvider: version.modelProvider,
    modelVersion: version.modelVersion,
    promptVersion: version.promptVersion,
    promptHash: version.promptHash,
    embeddingModel: version.embeddingModel,
    parameters: version.parameters as Record<string, unknown> | undefined,
    createdAt: version.createdAt,
  };
}

/**
 * Get or create an AI version record for the current configuration
 * Used during complaint generation to link the generation to a version
 *
 * @returns The current AI version record
 */
export async function getOrCreateCurrentVersion(): Promise<AIVersionRecord> {
  const currentVersion = await getCurrentAIVersion();
  return recordAIVersion(currentVersion);
}
