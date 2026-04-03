/**
 * Smart Router — Unified Intent Detection & Tool Selection
 *
 * Single entry point that detects what the user wants and routes to the right tool.
 * Replaces scattered if/else chains in the controller with one clean function.
 *
 * Priority order:
 * 1. Agent override (Movie Director → always video)
 * 2. Video generation (explicit keywords or cinematic terms)
 * 3. Image generation (create/generate image/logo/poster)
 * 4. Web search (needs real-time data)
 * 5. Chat (default — normal AI conversation)
 */

import { detectVideoIntent, type MediaType } from './mediaGenerationService.js';
import { detectImageIntent } from './imageIntentService.js';
import { needsWebSearch } from './webSearchService.js';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export type RouteAction = 'video' | 'image' | 'web_search_chat' | 'chat';

export interface RouteDecision {
  action: RouteAction;
  confidence: 'high' | 'medium' | 'low';

  // Video-specific
  video?: {
    mediaType: MediaType;
    extractedSubject: string;
    forceThinking: boolean;   // Movie Director always thinks
  };

  // Image-specific
  image?: {
    extractedSubject: string;
  };

  // Web search — enriches the chat, doesn't replace it
  webSearch?: {
    query: string;
  };
}

// ── Agent name cache (avoid repeated DB lookups) ─────────────────────

const agentNameCache = new Map<string, string>();

export async function getAgentName(agentId: string, prisma: any): Promise<string | null> {
  if (agentNameCache.has(agentId)) return agentNameCache.get(agentId)!;
  try {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } });
    if (agent?.name) {
      agentNameCache.set(agentId, agent.name);
      return agent.name;
    }
  } catch { /* silent */ }
  return null;
}

// ── Main Router ──────────────────────────────────────────────────────

/**
 * Analyze a user message and decide the best action.
 * Runs all detectors in one pass, returns the highest-priority match.
 */
export async function smartRoute(params: {
  message: string;
  hasImageAttachment: boolean;
  hasDocumentContext: boolean;
  agentId?: string;
  conversationMessages?: Array<{ role: string; content: string }>;
  prisma: any;
}): Promise<RouteDecision> {
  const { message, hasImageAttachment, hasDocumentContext, agentId, conversationMessages, prisma } = params;

  // ── 1. Agent override ──
  if (agentId) {
    const agentName = await getAgentName(agentId, prisma);

    // Movie Director → always video
    if (agentName === 'Movie Director') {
      logger.info(`Smart router: Movie Director agent → video (forced)`);
      return {
        action: 'video',
        confidence: 'high',
        video: {
          mediaType: hasImageAttachment ? 'image-to-video' : 'text-to-video',
          extractedSubject: message,
          forceThinking: true,
        },
      };
    }

    // Future: add more agent-specific routing here
    // e.g. "Data Analyst" agent → always use Think mode
    // e.g. "Web Researcher" agent → always search first
  }

  // ── Extract the user's ACTUAL question (strip embedded document content) ──
  // When documents are attached, the message looks like:
  //   "User question\n\n[DOCUMENT 1: ...]\n...[full PDF text]..."
  // We must only run intent detection on the user's question, not PDF content.
  let userQuestion = message;
  if (hasDocumentContext) {
    // Extract question before document blocks
    const docMarker = message.indexOf('\n\n═══ DOCUMENT ');
    const legacyMarker = message.indexOf('\n\n[Document: ');
    const marker = docMarker !== -1 ? docMarker : legacyMarker;
    if (marker !== -1) {
      userQuestion = message.substring(0, marker).trim();
    }
    // Also strip "[N files attached: ...]" instruction suffix
    userQuestion = userQuestion.replace(/\n\n\[\d+ files attached:.*?\]/s, '').trim();
  }

  // ── 2. Video detection (highest priority after agent override) ──
  // SKIP video/image detection entirely when documents are attached — PDF text
  // contains words like "video", "animation", "diagram" that trigger false positives
  if (!hasDocumentContext) {
    const videoIntent = detectVideoIntent(userQuestion, hasImageAttachment);
    if (videoIntent.isVideoRequest) {
      logger.info(`Smart router: video intent (${videoIntent.confidence}) → "${userQuestion.substring(0, 60)}"`);
      return {
        action: 'video',
        confidence: videoIntent.confidence,
        video: {
          mediaType: videoIntent.mediaType,
          extractedSubject: videoIntent.extractedSubject,
          forceThinking: false,
        },
      };
    }
  }

  // ── 3. Image detection ──
  if (!hasDocumentContext) {
    const imageIntent = detectImageIntent(userQuestion, conversationMessages);
    if (imageIntent.isImageRequest) {
      logger.info(`Smart router: image intent (${imageIntent.confidence}) → "${userQuestion.substring(0, 60)}"`);
      return {
        action: 'image',
        confidence: imageIntent.confidence,
        image: {
          extractedSubject: imageIntent.extractedSubject,
        },
      };
    }
  }

  // ── 4. Web search detection ──
  if (userQuestion && needsWebSearch(userQuestion, hasDocumentContext)) {
    logger.info(`Smart router: web search → "${message.substring(0, 60)}"`);
    return {
      action: 'web_search_chat',
      confidence: 'medium',
      webSearch: { query: message },
    };
  }

  // ── 5. Default: normal chat ──
  if (hasDocumentContext) {
    logger.info(`Smart router: document analysis (forced chat) → "${userQuestion.substring(0, 80)}"`);
  }
  return {
    action: 'chat',
    confidence: 'high',
  };
}
