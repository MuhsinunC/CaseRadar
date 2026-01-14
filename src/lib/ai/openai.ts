/**
 * OpenAI Client Wrapper
 * Provides a centralized OpenAI client instance for the application.
 */

import OpenAI from 'openai';

/**
 * Initialized OpenAI client
 * Uses OPENAI_API_KEY from environment variables
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
