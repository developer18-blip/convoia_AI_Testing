/**
 * Embedding Service — shared semantic-similarity primitives.
 *
 * Originally inlined in vectorMemoryService.ts (memory layer); extracted
 * on Apex Day 2 so the council's conditional Phase 2 skip can reuse the
 * same getEmbedding + cosineSimilarity primitives without duplicating
 * the OpenAI client setup.
 *
 * Memory-layer behavior is bit-identical pre/post extraction.
 */

import OpenAI from 'openai';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 256;

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: config.apiKeys.openai });
  return openai;
}

/**
 * Generate a 256-dim embedding for the given text. Caps input at 2000
 * chars (sufficient for similarity work; embedding model itself accepts
 * up to 8K tokens but truncating early keeps cost and latency bounded).
 *
 * On failure returns an empty array. Callers MUST handle this — an empty
 * vector against cosineSimilarity returns 0, which by convention means
 * "no similarity detected, do not match / do not skip".
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.substring(0, 2000),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    return response.data[0].embedding;
  } catch (err: any) {
    logger.error(`Embedding failed: ${err.message}`);
    return [];
  }
}

/**
 * Cosine similarity between two equal-length vectors. Returns 0 when
 * either is empty or zero-magnitude — the safe value for "no decision".
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
