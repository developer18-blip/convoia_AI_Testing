/**
 * Vector Memory Service — Semantic memory with embeddings
 *
 * 3-layer memory:
 * 1. Short-term: last 10 messages in current chat (handled by ChatContext)
 * 2. Long-term: extracted memories stored with embeddings
 * 3. Retrieval: semantic search → inject top 5 into prompt
 *
 * Uses OpenAI text-embedding-3-small ($0.00002/1K tokens)
 * Stores embeddings in PostgreSQL (JSON array, no pgvector needed)
 * Computes cosine similarity in JS for retrieval
 */

import OpenAI from 'openai';
import prismaClient from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const prisma = prismaClient as any;

// ── Embedding Service ────────────────────────────────────────────────

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: config.apiKeys.openai });
  return openai;
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 256; // Reduced dimensions for efficiency

/**
 * Generate embedding for a text. Cost: ~$0.00001 per call
 */
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.substring(0, 2000), // cap input
      dimensions: EMBEDDING_DIMENSIONS,
    });
    return response.data[0].embedding;
  } catch (err: any) {
    logger.error(`Embedding failed: ${err.message}`);
    return [];
  }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// ── Memory Types ─────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  importanceScore: number;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrievedMemory {
  content: string;
  category: string;
  score: number; // combined relevance + importance
}

// ── Memory Extraction (Rule-based + Pattern matching) ────────────────

const EXTRACTION_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  importance: number;
  extractor: (match: RegExpMatchArray, fullMsg: string) => string;
}> = [
  // Identity
  { pattern: /my name is ["']?(\w[\w\s]{1,30})["']?/i, category: 'identity', importance: 0.95, extractor: (m) => `User's name is ${m[1].trim()}` },
  { pattern: /(?:call me|i go by) ["']?(\w[\w\s]{1,20})["']?/i, category: 'identity', importance: 0.9, extractor: (m) => `User prefers to be called ${m[1].trim()}` },
  { pattern: /(?:i am a|i'm a|i work as) (.{3,50})/i, category: 'identity', importance: 0.8, extractor: (m) => `User's role: ${m[1].trim()}` },
  { pattern: /(?:i work at|i work for|my company is) (.{2,40})/i, category: 'identity', importance: 0.8, extractor: (m) => `User works at ${m[1].trim()}` },
  { pattern: /(?:i live in|i'm from|based in) (.{2,40})/i, category: 'identity', importance: 0.7, extractor: (m) => `User is based in ${m[1].trim()}` },
  { pattern: /(?:i am|i'm) (\d{1,3}) years old/i, category: 'identity', importance: 0.6, extractor: (m) => `User is ${m[1]} years old` },

  // Projects
  { pattern: /(?:i(?:'m| am) (?:building|creating|developing|working on)) (.{5,100})/i, category: 'project', importance: 0.85, extractor: (m) => `User is building: ${m[1].trim()}` },
  { pattern: /(?:my project|my app|my startup|my product) (?:is |called )?(.{3,60})/i, category: 'project', importance: 0.8, extractor: (m) => `User's project: ${m[1].trim()}` },
  { pattern: /(?:we use|our stack is|we're using) (.{5,80})/i, category: 'project', importance: 0.7, extractor: (m) => `Tech stack includes: ${m[1].trim()}` },

  // Preferences
  { pattern: /(?:i prefer|i like when you|please always) (.{5,80})/i, category: 'preference', importance: 0.75, extractor: (m) => `Preference: ${m[1].trim()}` },
  { pattern: /(?:always respond|always reply|always answer) in (\w+)/i, category: 'preference', importance: 0.9, extractor: (m) => `Always respond in ${m[1].trim()}` },
  { pattern: /(?:don't|never|avoid) (.{5,60})/i, category: 'preference', importance: 0.7, extractor: (m) => `Avoid: ${m[1].trim()}` },

  // Explicit memory commands
  { pattern: /(?:remember|save|store|note)(?: that| this:?)? (.{5,200})/i, category: 'fact', importance: 0.85, extractor: (m) => m[1].trim() },
  { pattern: /(?:keep in mind|don't forget)(?: that)? (.{5,200})/i, category: 'fact', importance: 0.85, extractor: (m) => m[1].trim() },

  // Goals
  { pattern: /(?:my goal is|i want to|i need to|i'm trying to) (.{5,100})/i, category: 'goal', importance: 0.7, extractor: (m) => `Goal: ${m[1].trim()}` },
];

// Anti-patterns: don't extract memory from these
const ANTI_PATTERNS = [
  /^(what|how|why|when|where|who|can you|could you|please|explain|tell me)/i,
  /\?$/, // Questions
  /```[\s\S]*```/, // Code blocks
];

/**
 * Extract memories from a message pair (user + assistant).
 * Returns extracted memory strings with categories and importance.
 */
export function extractMemoriesFromMessage(
  userMessage: string,
  _assistantResponse?: string
): Array<{ content: string; category: string; importance: number }> {
  // Skip questions and code
  for (const anti of ANTI_PATTERNS) {
    if (anti.test(userMessage.trim())) return [];
  }

  const memories: Array<{ content: string; category: string; importance: number }> = [];

  for (const { pattern, category, importance, extractor } of EXTRACTION_PATTERNS) {
    const match = userMessage.match(pattern);
    if (match) {
      const content = extractor(match, userMessage);
      if (content.length >= 5 && content.length <= 200) {
        memories.push({ content, category, importance });
      }
    }
  }

  return memories;
}

// ── Memory Storage ───────────────────────────────────────────────────

/**
 * Store a memory with its embedding. Deduplicates by similarity.
 */
export async function storeMemory(
  userId: string,
  content: string,
  category: string,
  importance: number
): Promise<boolean> {
  try {
    // Generate embedding
    const embedding = await getEmbedding(content);
    if (embedding.length === 0) {
      // Fallback: store without embedding
      await prisma.userMemory.upsert({
        where: { userId_key: { userId, key: `${category}_${simpleHash(content)}` } },
        create: {
          userId, category, key: `${category}_${simpleHash(content)}`,
          value: content, source: 'extracted',
        },
        update: { value: content, updatedAt: new Date() },
      });
      return true;
    }

    // Check for duplicates (cosine similarity > 0.85)
    const existing = await prisma.userMemory.findMany({
      where: { userId, category },
      select: { id: true, key: true, value: true, source: true },
    });

    // Load embeddings from a separate store or recompute
    // For now, check exact text match to avoid recomputing embeddings
    const isDuplicate = existing.some((e: any) =>
      e.value.toLowerCase().trim() === content.toLowerCase().trim()
    );

    if (isDuplicate) {
      logger.debug(`Duplicate memory skipped: "${content.substring(0, 50)}"`);
      return false;
    }

    // Store with embedding as JSON in the source field (hack until we have a vector column)
    const key = `${category}_${simpleHash(content)}`;
    await prisma.userMemory.upsert({
      where: { userId_key: { userId, key } },
      create: {
        userId, category, key,
        value: content,
        source: JSON.stringify({ embedding, importance }),
      },
      update: {
        value: content,
        source: JSON.stringify({ embedding, importance }),
        updatedAt: new Date(),
      },
    });

    logger.info(`Memory stored: [${category}] "${content.substring(0, 60)}" (importance: ${importance})`);
    return true;
  } catch (err: any) {
    logger.error(`Failed to store memory: ${err.message}`);
    return false;
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

// ── Memory Retrieval ─────────────────────────────────────────────────

// In-memory cache to avoid repeated vector searches
const retrievalCache = new Map<string, { memories: RetrievedMemory[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Retrieve relevant memories for a query.
 * Uses semantic similarity + importance scoring.
 * Returns top 5 most relevant memories.
 */
export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  maxResults: number = 5
): Promise<RetrievedMemory[]> {
  // Check cache
  const cacheKey = `${userId}:${query.substring(0, 100)}`;
  const cached = retrievalCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.memories;
  }

  try {
    // Get all user memories
    const allMemories = await prisma.userMemory.findMany({
      where: { userId },
      select: { id: true, category: true, key: true, value: true, source: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 100, // Cap at 100 memories per user
    });

    if (!allMemories || allMemories.length === 0) return [];

    // Generate query embedding
    const queryEmbedding = await getEmbedding(query);

    // Score each memory
    const scored: RetrievedMemory[] = [];

    for (const mem of allMemories) {
      let semanticScore = 0;
      let importance = 0.5;

      // Try to load embedding from source field
      try {
        const sourceData = JSON.parse(mem.source || '{}');
        if (sourceData.embedding && queryEmbedding.length > 0) {
          semanticScore = cosineSimilarity(queryEmbedding, sourceData.embedding);
        }
        if (sourceData.importance) {
          importance = sourceData.importance;
        }
      } catch {
        // Source is not JSON (old format) — use keyword matching
        semanticScore = keywordSimilarity(query, mem.value);
      }

      // If no embedding available, fall back to keyword matching
      if (semanticScore === 0 && queryEmbedding.length === 0) {
        semanticScore = keywordSimilarity(query, mem.value);
      }

      // Combined score: 70% semantic + 30% importance
      const combinedScore = (semanticScore * 0.7) + (importance * 0.3);

      // Time decay: reduce score for old memories (half-life: 30 days)
      const ageInDays = (Date.now() - new Date(mem.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.pow(0.5, ageInDays / 30);
      const finalScore = combinedScore * (0.5 + 0.5 * decayFactor); // Decay affects 50% of score

      if (finalScore > 0.15) { // Minimum relevance threshold
        scored.push({
          content: mem.value,
          category: mem.category,
          score: finalScore,
        });
      }
    }

    // Sort by score, return top N
    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    // Cache results
    retrievalCache.set(cacheKey, { memories: results, timestamp: Date.now() });

    return results;
  } catch (err: any) {
    logger.error(`Memory retrieval failed: ${err.message}`);
    return [];
  }
}

/**
 * Keyword-based similarity (fallback when embeddings unavailable)
 */
function keywordSimilarity(query: string, memory: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const memWords = new Set(memory.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (queryWords.size === 0 || memWords.size === 0) return 0;

  let matches = 0;
  for (const word of queryWords) {
    if (memWords.has(word)) matches++;
  }
  return matches / Math.max(queryWords.size, 1);
}

// ── Prompt Building ──────────────────────────────────────────────────

/**
 * Build a memory context string for injection into system prompt.
 * Optimized: max 300-500 tokens.
 */
export function buildMemoryContext(memories: RetrievedMemory[]): string {
  if (memories.length === 0) return '';

  // Group by category
  const groups: Record<string, string[]> = {};
  let totalChars = 0;
  const MAX_CHARS = 1500; // ~375 tokens

  for (const mem of memories) {
    if (totalChars >= MAX_CHARS) break;
    const cat = mem.category || 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(mem.content);
    totalChars += mem.content.length;
  }

  let context = '\n[USER MEMORY — Personalize responses using this context. This persists across all conversations.]\n';
  for (const [category, items] of Object.entries(groups)) {
    context += `${category}: ${items.join('. ')}.\n`;
  }
  context += '[Use this naturally. Don\'t explicitly mention "memory" unless asked.]\n';

  return context;
}

// ── Full Pipeline ────────────────────────────────────────────────────

/**
 * Complete memory pipeline for a user query:
 * 1. Retrieve relevant memories
 * 2. Build context string
 * 3. Extract new memories (background)
 */
export async function processMemoryForQuery(
  userId: string,
  userMessage: string
): Promise<string> {
  // Step 1: Retrieve relevant memories
  const memories = await retrieveRelevantMemories(userId, userMessage, 5);

  // Step 2: Build context
  const context = buildMemoryContext(memories);

  // Step 3: Extract and store new memories (background, don't block)
  const extracted = extractMemoriesFromMessage(userMessage);
  if (extracted.length > 0) {
    // Fire and forget
    Promise.all(
      extracted.map(m => storeMemory(userId, m.content, m.category, m.importance))
    ).catch(() => {});
  }

  return context;
}

// Clean retrieval cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of retrievalCache.entries()) {
    if (now - val.timestamp > CACHE_TTL) retrievalCache.delete(key);
  }
}, 60_000);
