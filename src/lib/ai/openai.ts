/**
 * OpenAI Client Wrapper
 * Provides a centralized OpenAI client instance for the application.
 */

import OpenAI from 'openai';

/**
 * Lazy-initialized OpenAI client
 * Uses OPENAI_API_KEY from environment variables
 */
let _openai: OpenAI | null = null;

/**
 * Get the OpenAI client (lazy initialization)
 */
export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

/**
 * Legacy export for backwards compatibility
 * @deprecated Use getOpenAI() instead
 */
export const openai = {
  get embeddings() {
    return getOpenAI().embeddings;
  },
  get chat() {
    return getOpenAI().chat;
  },
};

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
