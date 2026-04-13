import { Request, Response } from 'express';
import AIGatewayService, { getSystemPrompt, classifyQueryComplexity } from '../services/aiGatewayService.js';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { afterQueryMiddleware } from '../middleware/tokenTracker.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import { NotificationService } from '../services/notificationService.js';
import { needsWebSearch, searchWeb } from '../services/webSearchService.js';
import { enhanceImagePrompt } from '../services/imageIntentService.js';
import { FileProcessingService } from '../services/fileProcessingService.js';
import { generateVideo as generateVideoFn, VIDEO_TOKEN_COST, type MediaRequest } from '../services/mediaGenerationService.js';
import { TOKEN_BASE_RATE, costAdjustedTokens } from '../config/tokenPackages.js';
import { buildThinkModeParams } from '../ai/thinkModeParams.js';

// ── SAFE ERROR SERIALIZER (prevents circular reference crash) ────
// Axios errors contain TLSSocket → ClientRequest → socket circular refs.
// Never pass raw axios error objects to JSON.stringify or logger.
function safeErrorDetails(err: any): Record<string, any> {
  const details: Record<string, any> = {
    message: err?.message || 'Unknown error',
    code: err?.code,
    status: err?.response?.status,
    statusText: err?.response?.statusText,
  };
  // err.response.data may be a stream (circular) — extract safely
  try {
    const data = err?.response?.data;
    if (data && typeof data === 'object' && typeof data.pipe !== 'function') {
      details.errorBody = JSON.stringify(data).slice(0, 500);
    } else if (typeof data === 'string') {
      details.errorBody = data.slice(0, 500);
    }
  } catch { /* circular or unserializable — skip */ }
  // err.config.data is the sent request body (string, safe)
  try {
    const sent = err?.config?.data;
    if (typeof sent === 'string') details.sentBody = sent.slice(0, 800);
  } catch { /* skip */ }
  return details;
}

// costAdjustedTokens() is now imported from config/tokenPackages.ts
// It converts a query's dollar cost into wallet tokens using TOKEN_BASE_RATE.
import { smartRoute } from '../services/smartRouter.js';
import { getCachedResponse, setCachedResponse } from '../services/modelRecommendationService.js';
import { getUserMemoryPrompt } from '../services/userMemoryService.js';
import { processMemoryForQuery } from '../services/vectorMemoryService.js';
import { analyzeQuery, getClarificationSystemPrompt, getDeepResearchPrompt, buildRefinementPrompt } from '../services/thinkingService.js';
import { getModelIntelligence } from '../ai/modelRegistry.js';
import { fetchAndExtractURLs } from '../services/urlFetchService.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

// Image-only models that cannot handle chat/streaming
const IMAGE_ONLY_MODELS = new Set([
  'dall-e-3', 'dall-e-2', 'gpt-image-1', 'gpt-image-1-mini',
  'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview',
]);

export const queryAI = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { modelId, messages, industry, agentId } = req.body;
  if (!modelId || !messages || messages.length === 0) {
    throw new AppError('modelId and messages are required', 400);
  }
  // Block image-only models from chat + check if model is active
  const modelCheck = await prisma.aIModel.findUnique({ where: { id: modelId }, select: { modelId: true, name: true, isActive: true } });
  if (modelCheck && !modelCheck.isActive) {
    throw new AppError(`${modelCheck.name} has been deactivated by the platform admin. Please select a different model.`, 400);
  }
  if (modelCheck && IMAGE_ONLY_MODELS.has(modelCheck.modelId)) {
    throw new AppError(`${modelCheck.name} is an image generation model and cannot be used for chat. Please select a different model.`, 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const organizationId = await getOrCreatePersonalOrg(user.id);

  // Check token balance — estimate includes system prompt (~500 tokens) + all message history
  const tokenBalance = await TokenWalletService.getBalance(user.id);
  const inputText = messages.map((m: any) => m.content).join(' ');
  // Realistic estimation: each char ≈ 0.25 tokens, plus ~500 for system prompt overhead
  const estimatedInputTokens = Math.ceil(inputText.length / 4) + 500;
  // Minimum balance needed: input estimate + 200 buffer for at least a short response
  const minimumRequired = estimatedInputTokens + 200;

  if (tokenBalance.tokenBalance <= 0) {
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'NO_TOKENS',
      message: isOrgMember
        ? 'You have no tokens remaining. Contact your manager for more tokens.'
        : 'You have no tokens remaining.',
      currentBalance: 0,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }

  if (tokenBalance.tokenBalance < minimumRequired) {
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: isOrgMember
        ? `Insufficient token balance. You have ${TokenWalletService.formatTokens(tokenBalance.tokenBalance)} tokens remaining. Contact your manager for more tokens.`
        : `You need more tokens. You have ${TokenWalletService.formatTokens(tokenBalance.tokenBalance)} tokens remaining.`,
      currentBalance: tokenBalance.tokenBalance,
      estimatedRequired: minimumRequired,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }
  let finalModelId = modelId;
  let autoDowngraded = false;
  let autoDowngradeReason: string | undefined;
  const budget = await prisma.budget.findFirst({
    where: { userId: user.id },
  });
  if (budget && budget.currentUsage >= budget.monthlyCap) {
    if (budget.autoDowngrade && budget.fallbackModelId) {
      finalModelId = budget.fallbackModelId;
      autoDowngraded = true;
      autoDowngradeReason = `Budget cap reached ($${budget.currentUsage.toFixed(2)}/$${budget.monthlyCap.toFixed(2)}). Auto-downgraded to fallback model.`;
      logger.info(`User ${user.id} auto-downgraded due to budget cap. Original: ${modelId}, Fallback: ${finalModelId}`);
    } else if (!budget.autoDowngrade) {
      return res.status(402).json({
        success: false,
        message: 'Monthly budget cap reached. Auto-downgrade is disabled.',
        budgetUsage: budget.currentUsage,
        budgetCap: budget.monthlyCap,
      });
    }
  }
  // Look up agent config if specified
  let agentConfig: { systemPrompt: string; temperature: number; maxTokens: number; topP: number; name: string } | undefined;
  if (agentId) {
    const agent = await (prisma as any).agent.findUnique({ where: { id: agentId } });
    if (agent && agent.isActive) {
      agentConfig = {
        systemPrompt: agent.systemPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        topP: agent.topP,
        name: agent.name,
      };
      // Do NOT override finalModelId here — the frontend already sets the model
      // when an agent is selected. The user's explicit model choice must be respected.
    }
  }

  // Cap output tokens so total (input + output) stays within user's balance
  // Reserve tokens for estimated input; output gets the remainder
  const maxOutputForBalance = Math.max(tokenBalance.tokenBalance - estimatedInputTokens, 200);

  const startTime = Date.now();
  const aiResponse = await AIGatewayService.sendMessage({
    userId: user.id,
    organizationId,
    modelId: finalModelId,
    messages,
    industry: industry || user.organization?.industry || undefined,
    agentConfig,
    maxOutputTokens: maxOutputForBalance,
  });
  const executionTime = Date.now() - startTime;

  // Create usage log directly
  await prisma.usageLog.create({
    data: {
      userId: user.id,
      organizationId,
      modelId: aiResponse.aiModel.id,
      prompt: inputText.substring(0, 500),
      response: aiResponse.response.substring(0, 500),
      tokensInput: aiResponse.inputTokens,
      tokensOutput: aiResponse.outputTokens,
      totalTokens: aiResponse.totalTokens,
      providerCost: aiResponse.providerCost,
      markupPercentage: aiResponse.markupPercentage,
      customerPrice: aiResponse.customerPrice,
      status: 'completed',
    },
  });

  // Deduct cost-adjusted tokens from wallet
  await TokenWalletService.deductTokens({
    userId: user.id,
    tokens: costAdjustedTokens(aiResponse.customerPrice, aiResponse.totalTokens),
    reference: aiResponse.aiModel.id,
    description: `Query: ${aiResponse.aiModel.name}`,
    organizationId,
  });

  // Increment budget currentUsage so budget caps actually work
  try {
    await prisma.budget.updateMany({
      where: { userId: user.id },
      data: { currentUsage: { increment: aiResponse.customerPrice } },
    });
  } catch { /* budget tracking is non-critical */ }

  // Check for low balance and notify (fire and forget)
  const balAfter = await TokenWalletService.getBalance(user.id);
  if (balAfter.tokenBalance > 0 && balAfter.tokenBalance < 5000) {
    NotificationService.onLowBalance(user.id, balAfter.tokenBalance).catch(() => {});
  }

  logger.info(
    `Query complete — User: ${user.id}, Model: ${aiResponse.aiModel.name}, Tokens: ${aiResponse.totalTokens}`
  );
  return res.json({
    success: true,
    statusCode: 200,
    message: 'Query executed successfully',
    data: {
      model: aiResponse.aiModel.name,
      provider: aiResponse.aiModel.provider,
      response: aiResponse.response,
      tokensUsed: aiResponse.totalTokens,
      tokens: {
        input: aiResponse.inputTokens,
        output: aiResponse.outputTokens,
        total: aiResponse.totalTokens,
      },
      fallback: aiResponse.fallbackUsed
        ? {
            used: true,
            reason: aiResponse.fallbackReason,
            model: aiResponse.aiModel.name,
          }
        : { used: false },
      autoDowngraded,
      autoDowngradeReason,
      originalModelId: autoDowngraded ? modelId : undefined,
      executionTime,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * SSE streaming endpoint — streams AI response token-by-token.
 * Sends: data chunks, then a final [DONE] event with metadata.
 */
export const queryAIStream = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { modelId, messages, industry, agentId, thinkingEnabled, referenceImage, referenceImages } = req.body;
    // Debug: log multi-file info
    if (referenceImages?.length > 0 || referenceImage) {
      logger.info(`Files received: referenceImages=${referenceImages?.length || 0}, referenceImage=${referenceImage ? 'yes' : 'no'}`);
    }
    if (!modelId || !messages || messages.length === 0) {
      res.status(400).json({ success: false, message: 'modelId and messages are required' });
      return;
    }

    // Debug: log message roles and content lengths to diagnose PDF context issues
    const msgSummary = messages.map((m: any) => `${m.role}:${typeof m.content === 'string' ? m.content.length : 0}chars`).join(', ');
    logger.info(`Stream request: ${messages.length} msgs [${msgSummary}], hasSystemMsg=${messages.some((m: any) => m.role === 'system')}`);

    // Check if model is active + handle image models
    const streamModelCheck = await prisma.aIModel.findUnique({ where: { id: modelId }, select: { id: true, modelId: true, name: true, provider: true, isActive: true } });
    if (streamModelCheck && !streamModelCheck.isActive) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: `**${streamModelCheck.name}** has been deactivated by the platform admin. Please select a different model.` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', tokens: { input: 0, output: 0, total: 0 }, tokensUsed: 0, cost: { charged: '0' }, model: streamModelCheck.name, provider: streamModelCheck.provider })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (streamModelCheck && IMAGE_ONLY_MODELS.has(streamModelCheck.modelId)) {
      // ── TOKEN ENFORCEMENT: Check balance BEFORE image generation ──
      const imgTokenBalance = await TokenWalletService.getBalance(req.user.userId);
      const imageTokenMin = 1500; // Conservative estimate (Gemini=1300, DALL-E=1000)
      if (imgTokenBalance.tokenBalance <= 0) {
        const imgUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { organizationId: true, role: true } });
        const isOrgMember = !!imgUser?.organizationId;
        res.status(402).json({
          success: false,
          code: 'NO_TOKENS',
          message: isOrgMember
            ? 'You have no tokens remaining. Contact your manager for more tokens.'
            : 'You have no tokens remaining.',
          currentBalance: 0,
          canBuyTokens: !isOrgMember || imgUser?.role === 'org_owner',
        });
        return;
      }
      if (imgTokenBalance.tokenBalance < imageTokenMin) {
        const imgUser = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { organizationId: true, role: true } });
        const isOrgMember = !!imgUser?.organizationId;
        res.status(402).json({
          success: false,
          code: 'INSUFFICIENT_TOKENS',
          message: isOrgMember
            ? `Insufficient tokens for image generation. You have ${TokenWalletService.formatTokens(imgTokenBalance.tokenBalance)} tokens. Contact your manager.`
            : `You need more tokens for image generation. You have ${TokenWalletService.formatTokens(imgTokenBalance.tokenBalance)} tokens remaining.`,
          currentBalance: imgTokenBalance.tokenBalance,
          estimatedRequired: imageTokenMin,
          canBuyTokens: !isOrgMember || imgUser?.role === 'org_owner',
        });
        return;
      }

      const lastMsg = messages[messages.length - 1]?.content || '';
      // Build contextual prompt from conversation history
      // If the latest message is a short follow-up (e.g., "with different angle", "make it darker"),
      // combine it with previous messages to give the image model full context
      let imagePrompt = lastMsg;
      if (lastMsg.length < 60 && messages.length > 1) {
        // Find the most recent substantial message (likely the original image request)
        const contextMessages = messages
          .filter((m: any) => m.role === 'user' && m.content && m.content.length > 10)
          .map((m: any) => m.content)
          .slice(-3); // Last 3 user messages for context
        if (contextMessages.length > 1) {
          imagePrompt = `Based on: "${contextMessages.slice(0, -1).join('. ')}". Now: ${lastMsg}`;
        }
      }
      // Set up SSE and generate image
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      try {
        const imgUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Generating image...' })}\n\n`);
        // Route to correct provider based on selected model
        const providerMap: Record<string, 'gemini' | 'dalle' | 'gpt-image-1'> = { 'gpt-image-1': 'gpt-image-1', 'dall-e-3': 'dalle', 'gemini-2.5-flash-image': 'gemini', 'gemini-3-pro-image-preview': 'gemini' };
        const imageProvider = providerMap[streamModelCheck.modelId] || 'gemini';
        const result = await FileProcessingService.generateImage(imagePrompt, '1024x1024', 'standard', imageProvider, referenceImage);
        // Image gen: cost-adjusted deduction. DALL-E ~$0.04/image, Gemini ~$0.003, GPT Image ~$0.08
        const imageProviderCost = result.provider === 'gpt-image-1' ? 0.08 : result.provider === 'dalle' ? 0.04 : 0.003;
        const imageCustPrice = imageProviderCost * 1.25; // 25% markup
        const imageTokenCost = costAdjustedTokens(imageCustPrice, result.provider === 'gemini' ? 1300 : 1000);
        await TokenWalletService.deductTokens({ userId: req.user.userId, tokens: imageTokenCost, reference: `image-gen-${Date.now()}`, description: `Image generation (${streamModelCheck.name})`, organizationId: imgUser?.organizationId || undefined });
        // Send description only — the actual image renders via imageUrl in the done event
        const imageContent = `**Image generated:** "${result.revisedPrompt}"`;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: imageContent })}\n\n`);
        const imgCustomerPrice = imageTokenCost * TOKEN_BASE_RATE; // ~$0.002 per 1K tokens
        res.write(`data: ${JSON.stringify({ type: 'done', tokens: { input: 0, output: imageTokenCost, total: imageTokenCost }, tokensUsed: imageTokenCost, cost: { charged: imgCustomerPrice.toFixed(6) }, model: streamModelCheck.name, provider: 'openai', imageGenerated: true, imageUrl: result.imageUrl })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        // Log usage
        const orgId = imgUser?.organizationId || undefined;
        await prisma.usageLog.create({ data: { userId: req.user.userId, organizationId: orgId, modelId: streamModelCheck.id, prompt: lastMsg.substring(0, 500), response: `[Image: ${result.revisedPrompt?.substring(0, 200)}]`, tokensInput: 0, tokensOutput: imageTokenCost, totalTokens: imageTokenCost, providerCost: 0, markupPercentage: 20, customerPrice: imgCustomerPrice, status: 'completed' } });
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\nImage generation failed: ${err.message}` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', tokens: { input: 0, output: 0, total: 0 }, tokensUsed: 0, cost: { charged: '0' }, model: streamModelCheck.name, provider: 'openai' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organization: true },
    });
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    const organizationId = await getOrCreatePersonalOrg(user.id);

    // ── SAVE ORIGINAL USER MESSAGE (before URL enrichment) ─────
    // Smart router + image/video intent detection must use the ORIGINAL
    // short message, not the URL-enriched version (which can be 15K+ chars).
    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const latestUserText = typeof latestUserMsg?.content === 'string' ? latestUserMsg.content : '';

    // ── URL FETCH — enrich messages with fetched page content ──
    const lastMsgForUrl = latestUserMsg;
    const lastMsgText = latestUserText;
    if (lastMsgText) {
      try {
        const urlResult = await fetchAndExtractURLs(lastMsgText);
        if (urlResult.urls.length > 0) {
          // Replace the user message content with enriched version
          const msgIndex = messages.lastIndexOf(lastMsgForUrl);
          if (msgIndex >= 0) {
            messages[msgIndex] = { ...messages[msgIndex], content: urlResult.enrichedMessage };
          }
          const fetched = urlResult.urls.filter((u: any) => u.success).length;
          logger.info(`URL enrichment: ${fetched}/${urlResult.urls.length} URLs fetched for user ${req.user!.userId}`);
        }
      } catch (err: any) {
        logger.warn(`URL fetch failed silently: ${err.message}`);
      }
    }

    // ── CLASSIFY QUERY COMPLEXITY ─────────────────────────────
    // Used for: dynamic history cap, lightweight system prompt, memory skip
    // NOTE: uses latestUserText (original message), NOT the enriched version
    const queryComplexity = classifyQueryComplexity(latestUserText);

    // ── CAP CONVERSATION HISTORY ──────────────────────────────
    // Aggressive trimming to prevent old verbose responses from inflating
    // input tokens. Simple/standard queries keep last few turns; complex
    // queries can go deeper but still have a ceiling.
    const MAX_HISTORY_MESSAGES = queryComplexity === 'simple' ? 4
      : queryComplexity === 'standard' ? 8
      : 16;
    let cappedMessages = messages;
    if (messages.length > MAX_HISTORY_MESSAGES) {
      const systemMsg = messages[0]?.role === 'system' ? [messages[0]] : [];
      const recentMsgs = messages.slice(-(MAX_HISTORY_MESSAGES - systemMsg.length));
      const trimmedCount = messages.length - (systemMsg.length + recentMsgs.length);
      cappedMessages = [...systemMsg, ...recentMsgs];
      logger.info(`Trimmed conversation history: removed ${trimmedCount} old messages, keeping ${cappedMessages.length} (max ${MAX_HISTORY_MESSAGES}, complexity=${queryComplexity})`);
    }

    // ── CAP PER-MESSAGE LENGTH ────────────────────────────────
    // Old assistant responses from the removed 5-step template can be
    // massive (2000-4000 chars each). Truncate historical assistant
    // messages to prevent them from dominating the context. The latest
    // user message and any document/URL context is preserved.
    const MAX_HIST_ASSISTANT_CHARS = queryComplexity === 'simple' ? 800
      : queryComplexity === 'standard' ? 1500
      : 3000;
    const lastIdx = cappedMessages.length - 1;
    cappedMessages = cappedMessages.map((m: any, i: number) => {
      // Don't touch: the latest message, system messages, non-string content
      if (i === lastIdx || m.role === 'system' || typeof m.content !== 'string') return m;
      // Only trim historical assistant messages (user messages are usually short)
      if (m.role === 'assistant' && m.content.length > MAX_HIST_ASSISTANT_CHARS) {
        return { ...m, content: m.content.slice(0, MAX_HIST_ASSISTANT_CHARS) + '\n[... truncated]' };
      }
      return m;
    });

    // Check token balance — estimate includes system prompt (~500 tokens) + all message history
    const streamTokenBalance = await TokenWalletService.getBalance(user.id);
    const inputText = cappedMessages.map((m: any) => m.content).join(' ');
    const estimatedInputTokens = Math.ceil(inputText.length / 4) + 500;
    const minimumRequired = estimatedInputTokens + 200;

    if (streamTokenBalance.tokenBalance <= 0) {
      const isOrgMember = !!user.organizationId;
      res.status(402).json({
        success: false,
        code: 'NO_TOKENS',
        message: isOrgMember
          ? 'You have no tokens remaining. Contact your manager for more tokens.'
          : 'You have no tokens remaining.',
        currentBalance: 0,
        canBuyTokens: !isOrgMember || user.role === 'org_owner',
      });
      return;
    }

    if (streamTokenBalance.tokenBalance < minimumRequired) {
      const isOrgMember = !!user.organizationId;
      res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_TOKENS',
        message: isOrgMember
          ? `Insufficient token balance. You have ${TokenWalletService.formatTokens(streamTokenBalance.tokenBalance)} tokens. Contact your manager.`
          : `You need more tokens. You have ${TokenWalletService.formatTokens(streamTokenBalance.tokenBalance)} tokens remaining.`,
        currentBalance: streamTokenBalance.tokenBalance,
        estimatedRequired: minimumRequired,
        canBuyTokens: !isOrgMember || user.role === 'org_owner',
      });
      return;
    }

    // Budget check
    let finalModelId = modelId;
    let autoDowngraded = false;
    let autoDowngradeReason: string | undefined;
    const budget = await prisma.budget.findFirst({ where: { userId: user.id } });
    if (budget && budget.currentUsage >= budget.monthlyCap) {
      if (budget.autoDowngrade && budget.fallbackModelId) {
        finalModelId = budget.fallbackModelId;
        autoDowngraded = true;
        autoDowngradeReason = `Budget cap reached. Auto-downgraded to fallback model.`;
      } else if (!budget.autoDowngrade) {
        res.status(402).json({ success: false, message: 'Monthly budget cap reached' });
        return;
      }
    }

    // ── AUTO-ROUTE LONG INPUTS TO LARGER MODEL ──────────────────
    // If input exceeds the selected model's context window, auto-route
    // to the largest available model instead of truncating and losing data.
    const selectedModel = await prisma.aIModel.findUnique({ where: { id: finalModelId }, select: { modelId: true, contextWindow: true, name: true, provider: true } });
    const modelContextWindow = selectedModel?.contextWindow || 128000;
    const maxInputForModel = Math.floor(modelContextWindow * 0.7);

    if (estimatedInputTokens > maxInputForModel) {
      // Find the largest active model that can fit this input
      const largerModel = await prisma.aIModel.findFirst({
        where: { isActive: true, contextWindow: { gte: Math.ceil(estimatedInputTokens / 0.7) } },
        orderBy: [{ contextWindow: 'asc' }], // smallest model that fits (cost efficient)
        select: { id: true, modelId: true, name: true, contextWindow: true },
      });

      if (largerModel && largerModel.id !== finalModelId) {
        logger.info(`Auto-routing: input ~${estimatedInputTokens} tokens exceeds ${selectedModel?.name} (${modelContextWindow}). Routing to ${largerModel.name} (${largerModel.contextWindow}).`);
        finalModelId = largerModel.id;
        autoDowngraded = true;
        autoDowngradeReason = `Your input (~${TokenWalletService.formatTokens(estimatedInputTokens)} tokens) exceeds ${selectedModel?.name}'s context window. Auto-routed to **${largerModel.name}** (${TokenWalletService.formatTokens(largerModel.contextWindow)} context) to process your full content.`;
      } else if (!largerModel) {
        // No model can fit — will be truncated by trimToContextWindow
        logger.warn(`No model with context window >= ${Math.ceil(estimatedInputTokens / 0.7)} tokens. Input will be truncated.`);
      }
    }

    // ── SMART ROUTER — unified intent detection ─────────────────
    // IMPORTANT: Use original latestUserText (saved before URL enrichment),
    // NOT the enriched message. The enriched content is 15K+ chars which
    // breaks image/video intent detection and exceeds prompt limits.
    void latestUserMsg; // used above for URL enrichment
    const lastUserText = latestUserText;

    const route = await smartRoute({
      message: lastUserText,
      hasImageAttachment: !!referenceImage || (referenceImages && referenceImages.length > 0),
      hasDocumentContext: lastUserText.includes('Here is the attached document content:'),
      agentId,
      conversationMessages: cappedMessages,
      prisma,
    });

    if (route.action === 'video' && route.video) {
      const isMovieDirectorAgent = route.video.forceThinking;
      logger.info(`Smart route → video (${route.confidence}): type=${route.video.mediaType}, "${lastUserText.substring(0, 80)}"`);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        let videoPrompt = route.video.extractedSubject || lastUserText;
        let videoThinkTokens = 0; // extra tokens from AI prompt enhancement

        // ── THINK MODE: Use AI to craft a pro-level cinematic prompt ──
        // Movie Director agent ALWAYS uses think mode for better video prompts
        const useDirectorThinking = thinkingEnabled || isMovieDirectorAgent;
        if (useDirectorThinking) {
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Thinking about your vision...' })}\n\n`);
          try {
            const directorResult = await AIGatewayService.sendMessage({
              userId: user.id,
              organizationId,
              modelId: finalModelId,
              messages: [{ role: 'user', content: videoPrompt }],
              agentConfig: {
                systemPrompt: `You are an elite AI film director and cinematographer. The user wants to generate a video.

Your job: Transform their idea into a DETAILED cinematic video prompt that will produce stunning visuals.

Include SPECIFIC details about:
- Camera work (tracking shot, drone aerial, steadicam, dolly zoom, crane shot, handheld)
- Lighting (golden hour, rim lighting, volumetric fog, lens flares, chiaroscuro)
- Color palette (teal and orange, desaturated, warm tones, neon accents)
- Motion (slow motion 120fps, time-lapse, parallax, whip pan)
- Atmosphere (rain droplets, dust particles, smoke, mist, bokeh)
- Composition (rule of thirds, leading lines, depth of field, foreground elements)

Output ONLY the enhanced prompt — no explanations, no markdown, no quotes. Just the cinematic description in one paragraph, under 200 words.`,
                temperature: 0.7,
                maxTokens: 300,
                topP: 0.9,
                name: 'Director',
              },
              maxOutputTokens: 300,
            });

            if (directorResult.response && directorResult.response.length > 20) {
              videoPrompt = directorResult.response.trim();
              // Track the thinking tokens for billing
              videoThinkTokens = (directorResult.inputTokens || 0) + (directorResult.outputTokens || 0);
              logger.info(`Think mode enhanced video prompt: "${videoPrompt.substring(0, 100)}..."`);
              res.write(`data: ${JSON.stringify({ type: 'thinking_result', content: `**Director's Vision:**\n\n${videoPrompt}` })}\n\n`);
            }
          } catch (thinkErr: any) {
            logger.warn(`Video think mode failed, using original prompt: ${thinkErr.message}`);
          }
        } else {
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Analyzing your idea...' })}\n\n`);
        }

        // Build request
        const mediaRequest: MediaRequest = {
          prompt: videoPrompt,
          mediaType: route.video!.mediaType,
          userId: user.id,
        };

        // If image attached for image-to-video
        if (route.video!.mediaType === 'image-to-video' && referenceImage) {
          const match = referenceImage.match(/^data:(image\/\w+);base64,(.+)/);
          if (match) {
            mediaRequest.inputImageBase64 = match[2];
            mediaRequest.inputImageMimeType = match[1];
          } else {
            mediaRequest.inputImageBase64 = referenceImage;
          }
        }

        const result = await generateVideoFn(mediaRequest, (status) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'status', content: status })}\n\n`);
          }
        });

        // Look up Veo model for proper pricing
        const veoModel = await prisma.aIModel.findFirst({ where: { modelId: 'veo-2.0-generate-001' } });
        const veoModelId = veoModel?.id || finalModelId;
        const videoOutputPrice = veoModel?.outputTokenPrice || 0.0025;
        const videoMarkup = veoModel?.markupPercentage || 25;
        const totalVideoTokens = VIDEO_TOKEN_COST + videoThinkTokens;
        const providerCost = VIDEO_TOKEN_COST * videoOutputPrice;
        const videoCustomerPrice = providerCost * (1 + videoMarkup / 100);

        // Deduct cost-adjusted tokens for video gen
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: costAdjustedTokens(videoCustomerPrice, totalVideoTokens),
          reference: `video-gen-${Date.now()}`,
          description: `Video generation (Google Veo 2)${videoThinkTokens > 0 ? ' + AI director' : ''}`,
          organizationId,
        });

        // Send video result — video player rendered by frontend MessageBubble (not markdown)
        const enhancementsList = result.enhancementsApplied.join(', ');
        const videoContent = `**Generated Video**\n\n*Enhancements: ${enhancementsList}*\n\n*"${result.revisedPrompt.substring(0, 150)}..."*`;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: videoContent })}\n\n`);

        res.write(`data: ${JSON.stringify({
          type: 'done',
          tokens: { input: videoThinkTokens, output: VIDEO_TOKEN_COST, total: totalVideoTokens },
          tokensUsed: totalVideoTokens,
          cost: { charged: videoCustomerPrice.toFixed(6) },
          model: veoModel?.name || 'Google Veo 2',
          provider: 'google',
          videoGenerated: true,
          videoUrl: result.videoUrl,
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

        // Log usage with correct Veo model ID
        await prisma.usageLog.create({
          data: {
            userId: user.id, organizationId,
            modelId: veoModelId,
            prompt: lastUserText.substring(0, 500),
            response: `[Video: ${result.revisedPrompt.substring(0, 200)}]`,
            tokensInput: videoThinkTokens, tokensOutput: VIDEO_TOKEN_COST, totalTokens: totalVideoTokens,
            providerCost,
            markupPercentage: videoMarkup,
            customerPrice: videoCustomerPrice,
            status: 'completed',
          },
        });
        logger.info(`Video billed: ${VIDEO_TOKEN_COST} tokens, $${videoCustomerPrice.toFixed(4)} to user ${user.id}`);
      } catch (err: any) {
        logger.error(`Video generation failed: ${err.message}`);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\nVideo generation failed: ${err.message}` })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', tokens: { input: 0, output: 0, total: 0 }, tokensUsed: 0, cost: { charged: '0' }, model: 'Google Veo 2', provider: 'google-veo' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
      return;
    }

    // ── IMAGE INTENT (from smart router) ────────────────────────
    if (route.action === 'image' && route.image) {
      const imageIntent = { isImageRequest: true, confidence: route.confidence, extractedSubject: route.image.extractedSubject, originalMessage: lastUserText };
      logger.info(`Smart route → image (${route.confidence}): "${lastUserText.substring(0, 80)}"`);

      // Set up SSE for image generation
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        // Send generating status
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Generating image...' })}\n\n`);

        // Enhance prompt with conversation context
        const enhancedPrompt = enhanceImagePrompt(imageIntent.extractedSubject, {
          conversationContext: cappedMessages,
        });

        res.write(`data: ${JSON.stringify({ type: 'chunk', content: `**Generating image:** "${enhancedPrompt.substring(0, 100)}..."\n\n` })}\n\n`);

        // Generate image (Gemini first, DALL-E fallback) — pass reference image if available
        const result = await FileProcessingService.generateImage(enhancedPrompt, '1024x1024', 'standard', undefined, referenceImage);

        // Deduct cost-adjusted tokens for image gen
        const imgProvCost = result.provider === 'gemini' ? 0.003 : 0.04;
        const imgCustPrice = imgProvCost * 1.25;
        const imageTokenCost = costAdjustedTokens(imgCustPrice, result.provider === 'gemini' ? 1300 : 1000);
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: imageTokenCost,
          reference: `image-gen-${Date.now()}`,
          description: `Image generation (${result.provider === 'gemini' ? 'Gemini' : 'DALL-E'})`,
          organizationId,
        });

        // Send description only — the actual image renders via imageUrl in the done event
        const imageContent = `**Image generated:** "${result.revisedPrompt}"`;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: imageContent })}\n\n`);

        // Log usage — find the actual image model ID
        let imageModelId = finalModelId;
        try {
          const imgModelName = result.provider === 'gemini' ? 'gemini-2.5-flash-image' : 'dall-e-3';
          const imgModel = await prisma.aIModel.findFirst({ where: { modelId: imgModelName } });
          if (imgModel) imageModelId = imgModel.id;
        } catch { /* use chat model as fallback */ }

        const imgCustomerPrice = imageTokenCost * TOKEN_BASE_RATE;

        // Send done event with metadata including cost
        res.write(`data: ${JSON.stringify({
          type: 'done',
          tokens: { input: 0, output: imageTokenCost, total: imageTokenCost },
          tokensUsed: imageTokenCost,
          cost: { charged: imgCustomerPrice.toFixed(6) },
          model: result.provider === 'gemini' ? 'Gemini Flash Image' : 'DALL-E 3',
          provider: result.provider || 'openai',
          imageGenerated: true,
          imageUrl: result.imageUrl,
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        await prisma.usageLog.create({
          data: {
            userId: user.id, organizationId,
            modelId: imageModelId,
            prompt: lastUserText.substring(0, 500),
            response: `[Image generated: ${result.revisedPrompt?.substring(0, 200) || enhancedPrompt.substring(0, 200)}]`,
            tokensInput: 0, tokensOutput: imageTokenCost, totalTokens: imageTokenCost,
            providerCost: 0, markupPercentage: 20, customerPrice: imgCustomerPrice,
            status: 'completed',
          },
        });

        logger.info(`Image generated via ${result.provider} for user ${user.id}`);
      } catch (err: any) {
        logger.error(`Image generation failed: ${err.message}`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\nImage generation failed: ${err.message}. Try rephrasing your request.` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', tokens: { input: 0, output: 0, total: 0 }, tokensUsed: 0, cost: { charged: '0' }, model: 'Image Gen', provider: 'openai' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    // Agent config
    let agentConfig: { systemPrompt: string; temperature: number; maxTokens: number; topP: number; name: string } | undefined;
    if (agentId) {
      const agent = await (prisma as any).agent.findUnique({ where: { id: agentId } });
      if (agent && agent.isActive) {
        const identityPrefix = `Your name is "${agent.name}". You are a specialized AI agent on the ConvoiaAI platform. When asked "who are you", always introduce yourself as "${agent.name}" — never say you are Claude, GPT, or any underlying model. You were created by ConvoiaAI.\n\n`;
        agentConfig = {
          systemPrompt: identityPrefix + agent.systemPrompt, temperature: agent.temperature,
          maxTokens: agent.maxTokens, topP: agent.topP, name: agent.name,
        };
      }
    }

    // ── INTELLIGENT MEMORY SYSTEM ──────────────────────────────
    // 1. Retrieve relevant memories via semantic search (top 5)
    // 2. Extract new memories from user message (background)
    // 3. Build compact context string (max ~375 tokens)
    // Skip memory for simple queries (greetings) — saves ~100-150 tokens
    let memoryPrompt = '';
    if (queryComplexity !== 'simple') {
      try {
        memoryPrompt = await processMemoryForQuery(user.id, lastUserText);
      } catch {
        // Fallback to simple memory if vector service fails
        try { memoryPrompt = await getUserMemoryPrompt(user.id); } catch { /* silent */ }
      }
    }

    // Inject memory into agent's system prompt (if agent selected)
    if (memoryPrompt && agentConfig) {
      agentConfig.systemPrompt += memoryPrompt;
    }
    if (memoryPrompt) {
      logger.info(`Memory injected for user ${user.id}: ${memoryPrompt.substring(0, 100)}...`);
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Auto-downgrade note
    if (autoDowngraded && autoDowngradeReason) {
      res.write(`data: ${JSON.stringify({ type: 'note', content: autoDowngradeReason })}\n\n`);
    }

    // Cap output tokens so total (input + output) stays within user's balance
    // Minimum 4096 output tokens so responses are never cut short / unintelligent
    const streamMaxOutput = Math.max(streamTokenBalance.tokenBalance - estimatedInputTokens, 4096);

    // ── RESPONSE CACHE CHECK ──────────────────────────────────
    // If identical prompt + model was recently answered, return cached (ZERO tokens)
    const cachePrompt = lastUserText || inputText.substring(0, 500);
    const cached = getCachedResponse(cachePrompt, finalModelId);
    if (cached && !agentConfig) {
      logger.info(`Cache hit — returning cached response for user ${user.id}, saved ${cached.tokens} tokens`);
      const chunks = cached.response.match(/.{1,50}/gs) || [cached.response];
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({
        type: 'done', tokens: { input: 0, output: 0, total: 0 }, tokensUsed: 0,
        cost: { charged: '0' },
        model: streamModelCheck?.name || 'AI', provider: streamModelCheck?.provider || '', cached: true,
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const startTime = Date.now();
    let fullResponse = '';
    let streamEnded = false;
    let webSearched = false;

    // Handle client disconnect
    req.on('close', () => {
      streamEnded = true;
      logger.info(`Client disconnected from stream — User: ${user.id}`);
    });

    // Web search: check if the latest user message needs real-time data
    const lastUserMsg = [...cappedMessages].reverse().find((m: any) => m.role === 'user');
    const rawUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    // Extract actual user question if document context is embedded
    const docSeparator = '---\n\nUser question: ';
    const hasDocContext = rawUserContent.includes('Here is the attached document content:');
    const userQuery = hasDocContext && rawUserContent.includes(docSeparator)
      ? rawUserContent.split(docSeparator).pop()?.trim() || rawUserContent
      : rawUserContent;
    let enrichedMessages = cappedMessages;

    if (userQuery && needsWebSearch(userQuery, hasDocContext)) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Searching the web...' })}\n\n`);
        const searchResult = await searchWeb(userQuery, 5);
        if (searchResult.searched && searchResult.results.length > 0) {
          webSearched = true;
          // Append search data to user message (formatting rules go in system prompt below)
          const searchPrefix = `\n\n[LIVE WEB SEARCH DATA — searched on ${new Date().toISOString().split('T')[0]}]\n\n${searchResult.contextText}`;
          enrichedMessages = [...cappedMessages];
          const lastIdx = enrichedMessages.length - 1;
          if (enrichedMessages[lastIdx]?.role === 'user') {
            enrichedMessages[lastIdx] = {
              ...enrichedMessages[lastIdx],
              content: enrichedMessages[lastIdx].content + searchPrefix,
            };
          }

          // Send search indicator to frontend with rich metadata
          const sources = searchResult.results.slice(0, 5).map(r => ({
            title: r.title,
            url: r.url,
            image: r.image || undefined,
            siteName: r.siteName || undefined,
            snippet: r.snippet || (r.content ? r.content.substring(0, 150) : undefined),
          }));
          res.write(`data: ${JSON.stringify({ type: 'web_search', searched: true, query: searchResult.query, sources })}\n\n`);
        }
      } catch (err: any) {
        logger.error(`Web search error: ${err.message}`);
      }
    }

    // ── INJECT IMAGES INTO MESSAGES (multi-image support) ──────
    // Convert base64 images into multimodal content blocks in the last user message.
    // Works with all providers: OpenAI (image_url), Anthropic (image), Google (inlineData).
    const allImages: string[] = referenceImages?.length > 0
      ? referenceImages
      : referenceImage ? [referenceImage] : [];

    if (allImages.length > 0) {
      const lastIdx = enrichedMessages.length - 1;
      if (enrichedMessages[lastIdx]?.role === 'user') {
        const textContent = enrichedMessages[lastIdx].content;
        // Build multimodal content array: text + all images
        const contentParts: any[] = [{ type: 'text', text: textContent }];
        for (const imgBase64 of allImages) {
          // Detect mime type from base64 header or default to jpeg
          let mimeType = 'image/jpeg';
          let rawBase64 = imgBase64;
          if (imgBase64.startsWith('data:')) {
            const match = imgBase64.match(/^data:(image\/\w+);base64,/);
            if (match) {
              mimeType = match[1];
              rawBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
            }
          }
          contentParts.push({
            type: 'image_url',
            image_url: { url: imgBase64.startsWith('data:') ? imgBase64 : `data:${mimeType};base64,${rawBase64}` },
            // Anthropic/Google format (handled by provider routing)
            _base64: rawBase64,
            _mimeType: mimeType,
          });
        }
        enrichedMessages = [...enrichedMessages];
        enrichedMessages[lastIdx] = { ...enrichedMessages[lastIdx], content: contentParts };
        logger.info(`Injected ${allImages.length} image(s) into last user message for vision analysis`);
      }
    }

    // ── DEEP RESEARCH PIPELINE ─────────────────────────────────
    // 4-stage expert research system (activated when Think button is ON):
    //
    // Stage 1: Intent + Depth Detection (instant, rule-based)
    // Stage 2: Clarification (if query is vague — ask before answering)
    // Stage 3: Deep Research — Hypothesis + Multi-Angle Reasoning (Pass 1, non-streaming)
    // Stage 4: Iterative Refinement — Self-Critique + Polish (Pass 2, streaming)
    let pass1ExtraInputTokens = 0;
    let pass1ExtraOutputTokens = 0;
    let useProviderThinking = !!thinkingEnabled;

    if (thinkingEnabled) {
      const analysis = await analyzeQuery(
        userQuery,
        enrichedMessages,
        selectedModel?.modelId,
        config.apiKeys.openai || undefined,
        'gpt-4o-mini'
      );
      const thinkIntel = getModelIntelligence(selectedModel?.modelId || '');
      logger.info(`Deep research: depth=${analysis.depthLevel}, task=${analysis.taskType}, confidence=${analysis.confidenceScore.toFixed(2)}, hypotheses=${analysis.hypotheses.length}, clarify=${analysis.needsClarification}`);

      if (analysis.needsClarification) {
        // ── Stage 2: Clarification — ask smart questions instead of guessing ──
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Analyzing your question...' })}\n\n`);
        agentConfig = {
          systemPrompt: getClarificationSystemPrompt(analysis, selectedModel?.modelId),
          temperature: 0.3,
          maxTokens: 1000,
          topP: 0.9,
          name: agentConfig?.name || 'AI',
        };
        useProviderThinking = false;

      } else {
        // ── Stage 3 + 4: Deep Research → Refinement ──
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Decomposing the problem...' })}\n\n`);

        try {
          // Brief pause for UX (shows status before heavy processing)
          await new Promise(r => setTimeout(r, 400));

          if (analysis.hypotheses.length > 0 && !streamEnded) {
            res.write(`data: ${JSON.stringify({ type: 'status', content: `Evaluating ${analysis.hypotheses.length} possible interpretations...` })}\n\n`);
            await new Promise(r => setTimeout(r, 500));
          }

          const depthLabels: Record<string, string> = {
            surface: 'Analyzing key facts...',
            deep: 'Running deep multi-angle analysis...',
            research: 'Conducting expert-level research across multiple dimensions...',
          };
          res.write(`data: ${JSON.stringify({ type: 'status', content: depthLabels[analysis.depthLevel] || 'Researching...' })}\n\n`);

          // Pass 1: Deep Research (non-streaming)
          // Detect if user is answering a prior clarification question
          const prevAssistantMsg = [...enrichedMessages]
            .reverse()
            .find((m, i) => i > 0 && m.role === 'assistant');
          const isAnsweringClarification =
            prevAssistantMsg?.content &&
            typeof prevAssistantMsg.content === 'string' &&
            prevAssistantMsg.content.includes('?') &&
            userQuery.split(' ').length < 80;
          const clarificationContext = isAnsweringClarification
            ? `User's clarification answer: "${userQuery}"`
            : undefined;

          const researchPrompt = getDeepResearchPrompt(analysis, selectedModel?.modelId, clarificationContext);
          const pass1MaxTokens = analysis.depthLevel === 'research'
            ? Math.min(Math.floor(streamMaxOutput * 0.5), 6144)
            : Math.min(Math.floor(streamMaxOutput * 0.4), 4096);

          // Build tier-aware params for Pass 1
          const pass1Tp = buildThinkModeParams(selectedModel?.modelId || finalModelId);
          const pass1UseNativeThinking = pass1Tp.tier === 'A' || pass1Tp.tier === 'B';

          const pass1Result = await AIGatewayService.sendMessage({
            userId: user.id,
            organizationId,
            modelId: finalModelId,
            messages: enrichedMessages,
            agentConfig: {
              systemPrompt: researchPrompt,
              temperature: pass1Tp.tier === 'B' ? undefined as any : (pass1Tp.temperature === 1 ? 0.3 : 0.3),
              maxTokens: pass1MaxTokens,
              topP: 0.9,
              name: agentConfig?.name || 'AI',
            },
            maxOutputTokens: pass1MaxTokens,
            memoryContext: memoryPrompt || undefined,
            thinkingEnabled: pass1UseNativeThinking,
          });

          pass1ExtraInputTokens = pass1Result.inputTokens;
          pass1ExtraOutputTokens = pass1Result.outputTokens;

          // Send research to client (collapsible in UI)
          if (pass1Result.response && !streamEnded) {
            const researchSummary = pass1Result.response.length > 4000
              ? pass1Result.response.substring(0, 4000) + '\n\n[...analysis continues in refinement]'
              : pass1Result.response;
            res.write(`data: ${JSON.stringify({
              type: 'thinking_result',
              content: researchSummary,
              metadata: {
                depthLevel: analysis.depthLevel,
                taskType: analysis.taskType,
                modelTier: thinkIntel?.tier || 'unknown',
                hypothesesCount: analysis.hypotheses.length,
                usedNativeThinking: pass1UseNativeThinking,
              },
            })}\n\n`);
          }

          // Stage 4: Iterative Refinement — self-critique + polish
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Cross-checking assumptions...' })}\n\n`);
          await new Promise(r => setTimeout(r, 300));
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Refining and polishing response...' })}\n\n`);

          const refinementPrompt = buildRefinementPrompt(pass1Result.response, userQuery, analysis, selectedModel?.modelId);
          enrichedMessages = [
            ...enrichedMessages.slice(0, -1),
            { role: 'user', content: refinementPrompt },
          ];

          // CRITICAL: Use the full ConvoiaAI system prompt as base for Pass 2.
          // Without this, think mode responses lose all identity, formatting rules,
          // engagement behavior, and model-specific flavor.
          const thinkIndustry = industry || user.organization?.industry || undefined;
          const thinkProvider = selectedModel?.provider || undefined;
          const thinkModelId = selectedModel?.modelId || undefined;
          const baseThinkPrompt = getSystemPrompt(thinkIndustry, thinkProvider, 'think', thinkModelId);

          // Build tier-aware Think Mode params for Pass 2
          const tp = buildThinkModeParams(thinkModelId || finalModelId);

          agentConfig = {
            systemPrompt: baseThinkPrompt + `\n\n═══ THINK MODE: REFINEMENT PASS ═══\nYou have just completed a deep research phase. Now deliver a polished, consultant-grade response based on that research. Follow the output format in the user's message exactly. Be thorough but concise — every sentence must earn its place. The follow-up questions are MANDATORY.`,
            temperature: tp.temperature ?? 0.4,
            maxTokens: tp.max_tokens || agentConfig?.maxTokens || 16384,
            topP: 0.9,
            name: agentConfig?.name || 'AI',
          };

          // Tier A (Anthropic) — let native extended thinking handle Pass 2
          // Tier B (o-series) — let native reasoning handle it
          // Tier C/D — prompt-only, no provider thinking needed
          useProviderThinking = tp.tier === 'A' || tp.tier === 'B';

          logger.info(`Deep research Pass 1 complete: ${pass1Result.response.length} chars, ${pass1ExtraInputTokens + pass1ExtraOutputTokens} tokens, depth=${analysis.depthLevel}. Starting refinement.`);

        } catch (pass1Err: any) {
          // Pass 1 failed — fall back to normal streaming with thinking enabled
          logger.error(`Deep research Pass 1 failed, falling back to single-pass: ${pass1Err.message}`);
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Processing...' })}\n\n`);
          useProviderThinking = true;
        }
      }
    }

    // ── AUTONOMOUS AGENT ROUTING ─────────────────────────────
    // If agent has tools enabled, route through the orchestrator
    // The orchestrator handles tool-use loops and streams the final response
    if (agentId && agentConfig) {
      const agentRecord = await (prisma as any).agent.findUnique({ where: { id: agentId }, select: { toolsEnabled: true, tools: true, maxToolCalls: true } });
      if (agentRecord?.toolsEnabled) {
        const { runAgentOrchestrator } = await import('../services/agentOrchestrator.js');
        try {
          await runAgentOrchestrator(
            {
              userId: user.id, organizationId,
              agentId, modelId: finalModelId,
              messages: enrichedMessages,
              conversationId: undefined,
              industry: industry || user.organization?.industry || undefined,
            },
            {
              onChunk: (text: string) => {
                if (!streamEnded && !res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
                }
              },
              onToolUse: (tool) => {
                if (!streamEnded && !res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'tool_use', name: tool.name, input: tool.input })}\n\n`);
                }
              },
              onToolResult: (tool) => {
                if (!streamEnded && !res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tool.name, success: tool.result.success, output: typeof tool.result.output === 'string' ? tool.result.output.slice(0, 2000) : JSON.stringify(tool.result.output).slice(0, 2000) })}\n\n`);
                }
              },
              onDone: (inputTokens, outputTokens) => {
                if (!streamEnded && !res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'done', tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens } })}\n\n`);
                  res.write('data: [DONE]\n\n');
                  res.end();
                }
              },
              onError: (err) => {
                if (!streamEnded && !res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
                  res.write('data: [DONE]\n\n');
                  res.end();
                }
              },
            }
          );
        } catch (orchErr: any) {
          logger.error(`Agent orchestrator failed: ${orchErr.message}`);
          if (!streamEnded && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'error', content: 'Agent tool execution failed. Falling back to normal response.' })}\n\n`);
          }
          // Fall through to normal streaming below
        }
        return; // Don't fall through to normal streaming
      }
    }

    // ── STREAMING CALL (handles normal, clarification, and Pass 2 refinement) ──
    await AIGatewayService.sendMessageStream(
      {
        userId: user.id, organizationId,
        modelId: finalModelId, messages: enrichedMessages,
        industry: industry || user.organization?.industry || undefined,
        agentConfig,
        maxOutputTokens: streamMaxOutput,
        memoryContext: !thinkingEnabled ? (memoryPrompt || undefined) : undefined, // memory already in Pass 1
        thinkingEnabled: useProviderThinking,
        webSearchActive: webSearched,
        complexity: queryComplexity,
      },
      {
        onChunk: (text: string) => {
          if (streamEnded) return;
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
        },
        onDone: (rawInputTokens: number, rawOutputTokens: number) => {
          // Fire-and-forget the async post-processing
          (async () => {
            try {
              const executionTime = Date.now() - startTime;

              const aiModel = await prisma.aIModel.findUnique({ where: { id: finalModelId } });
              if (!aiModel) {
                if (!streamEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'error', content: 'Model not found' })}\n\n`);
                  res.write('data: [DONE]\n\n');
                  res.end();
                }
                return;
              }

              // Combine Pass 1 + Pass 2 tokens (pass1 extras are 0 for normal/clarification mode)
              const rawInputTotal = rawInputTokens + pass1ExtraInputTokens;
              const rawOutputTotal = rawOutputTokens + pass1ExtraOutputTokens;

              // Fallback: if provider didn't report token counts, estimate from text
              const inputTokens = rawInputTotal > 0 ? rawInputTotal : Math.ceil(inputText.length / 4) + 500;
              const outputTokens = rawOutputTotal > 0 ? rawOutputTotal : Math.ceil(fullResponse.length / 4);
              const totalTokensUsed = inputTokens + outputTokens;

              // Cache the response for identical future queries (saves tokens)
              if (fullResponse.length > 10 && !webSearched && !thinkingEnabled) {
                setCachedResponse(cachePrompt, finalModelId, fullResponse, totalTokensUsed);
              }

              if (rawInputTokens === 0 && rawOutputTokens === 0) {
                logger.warn(`Provider reported 0 tokens — using estimates: input=${inputTokens} output=${outputTokens} total=${totalTokensUsed}`);
              }

              const providerCost = inputTokens * aiModel.inputTokenPrice + outputTokens * aiModel.outputTokenPrice;
              const customerPrice = providerCost * (1 + aiModel.markupPercentage / 100);

              // 1. ALWAYS create usage log directly (bulletproof — no middleware dependency)
              try {
                logger.info(`Creating usageLog: userId=${user.id}, orgId=${organizationId}, model=${aiModel.name}, tokens=${totalTokensUsed}, cost=$${customerPrice.toFixed(6)}${pass1ExtraInputTokens > 0 ? ' (multi-pass)' : ''}`);
                await prisma.usageLog.create({
                  data: {
                    userId: user.id,
                    organizationId,
                    modelId: aiModel.id,
                    prompt: inputText.substring(0, 500),
                    response: fullResponse.substring(0, 500),
                    tokensInput: inputTokens,
                    tokensOutput: outputTokens,
                    totalTokens: totalTokensUsed,
                    providerCost,
                    markupPercentage: aiModel.markupPercentage,
                    customerPrice,
                    status: 'completed',
                  },
                });
                logger.info(`UsageLog created successfully for user ${user.id}`);
              } catch (logErr: any) {
                logger.error(`Direct usageLog creation FAILED: ${logErr.message}`, logErr);
              }

              // 2. Deduct cost-adjusted tokens from user's TokenWallet
              const walletTokens = costAdjustedTokens(customerPrice, totalTokensUsed);
              try {
                await TokenWalletService.deductTokens({
                  userId: user.id,
                  tokens: walletTokens,
                  reference: aiModel.id,
                  description: `Query: ${aiModel.name}${pass1ExtraInputTokens > 0 ? ' (deep think)' : ''}`,
                  organizationId,
                });
                logger.info(`Token deduction: raw=${totalTokensUsed} adjusted=${walletTokens} cost=$${customerPrice.toFixed(6)} model=${aiModel.name}`);
              } catch (deductErr) {
                logger.error('Token deduction failed:', deductErr);
              }

              // Increment budget currentUsage so budget caps actually work
              try {
                await prisma.budget.updateMany({
                  where: { userId: user.id },
                  data: { currentUsage: { increment: customerPrice } },
                });
              } catch { /* budget tracking is non-critical */ }

              if (!streamEnded && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({
                  type: 'done',
                  model: aiModel.name,
                  provider: aiModel.provider,
                  tokens: { input: inputTokens, output: outputTokens, total: totalTokensUsed },
                  tokensUsed: walletTokens,
                  cost: { charged: customerPrice.toFixed(6) },
                  executionTime,
                  webSearched,
                  deepThinking: pass1ExtraInputTokens > 0,
                })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
              }

              logger.info(`Stream complete — User: ${user.id}, Model: ${aiModel.name}, Cost: $${customerPrice.toFixed(6)}`);
            } catch (err: any) {
              logger.error(`Stream finalize error: ${err.message}`);
              if (!streamEnded && !res.writableEnded) {
                try { res.write('data: [DONE]\n\n'); res.end(); } catch { /* already closed */ }
              }
            }
          })();
        },
        onError: (error: Error & { response?: { data?: any; status?: number }; config?: { data?: any } }) => {
          logger.error('Stream error', {
            provider: selectedModel?.provider,
            modelId: selectedModel?.modelId,
            ...safeErrorDetails(error),
          });
          streamEnded = true;
          if (!res.writableEnded) {
            try {
              res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            } catch { /* response already closed */ }
          }
        },
      }
    ).catch(() => {
      // Stream errors are already handled by onError callback above.
      // This catch prevents unhandled rejection without double-writing.
    });
  } catch (err: any) {
    logger.error(`Stream setup error: ${err.message}`);
    if (!res.headersSent) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    } else if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch { /* response already closed */ }
    }
  }
};

export const compareModels = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { modelIds, messages, industry } = req.body;
  if (!modelIds || modelIds.length === 0 || !messages) {
    throw new AppError('modelIds array and messages are required', 400);
  }
  if (modelIds.length > 5) {
    throw new AppError('Cannot compare more than 5 models at once', 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const organizationId = await getOrCreatePersonalOrg(user.id);

  const compareTokenBal = await TokenWalletService.getBalance(user.id);
  const inputText = messages.map((m: any) => m.content).join(' ');
  // Estimate: (input + system prompt + response buffer) * number of models
  const estimatedInputPerModel = Math.ceil(inputText.length / 4) + 500;
  const estimatedPerModel = estimatedInputPerModel + 2000; // allow ~2000 output per model
  const estimatedTotal = estimatedPerModel * modelIds.length;

  if (compareTokenBal.tokenBalance <= 0) {
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'NO_TOKENS',
      message: isOrgMember
        ? 'You have no tokens remaining. Contact your manager for more tokens.'
        : 'You have no tokens remaining.',
      currentBalance: 0,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }
  if (compareTokenBal.tokenBalance < estimatedTotal) {
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: `Comparing ${modelIds.length} models requires ~${TokenWalletService.formatTokens(estimatedTotal)} tokens. You have ${TokenWalletService.formatTokens(compareTokenBal.tokenBalance)}.`,
      currentBalance: compareTokenBal.tokenBalance,
      estimatedRequired: estimatedTotal,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }
  const startTime = Date.now();
  const queries = modelIds.map((id: string) =>
    AIGatewayService.sendMessage({
      userId: user.id,
      organizationId,
      modelId: id,
      messages,
      industry: industry || user.organization?.industry || undefined,
    })
      .then(async (aiResponse) => {
        await afterQueryMiddleware(
          user.id,
          organizationId,
          aiResponse.aiModel.id,
          inputText,
          aiResponse.response,
          aiResponse.inputTokens,
          aiResponse.outputTokens,
          aiResponse.providerCost,
          aiResponse.customerPrice,
          aiResponse.markupPercentage
        );
        // Deduct cost-adjusted tokens for comparison
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: costAdjustedTokens(aiResponse.customerPrice, aiResponse.totalTokens),
          reference: aiResponse.aiModel.id,
          description: `Compare: ${aiResponse.aiModel.name}`,
          organizationId,
        });
        // Increment budget for comparison queries
        try {
          await prisma.budget.updateMany({
            where: { userId: user.id },
            data: { currentUsage: { increment: aiResponse.customerPrice } },
          });
        } catch { /* non-critical */ }
        return {
          modelId: id,
          modelName: aiResponse.aiModel.name,
          provider: aiResponse.aiModel.provider,
          response: aiResponse.response,
          tokens: {
            input: aiResponse.inputTokens,
            output: aiResponse.outputTokens,
            total: aiResponse.totalTokens,
          },
          cost: {
            provider: aiResponse.providerCost.toFixed(6),
            charged: aiResponse.customerPrice.toFixed(6),
          },
          fallbackUsed: aiResponse.fallbackUsed,
        };
      })
      .catch((error) => ({
        modelId: id,
        error: error.message,
        failed: true,
      }))
  );
  const responses = await Promise.all(queries);
  const executionTime = Date.now() - startTime;
  const successful = responses.filter((r) => !('failed' in r));
  const failed = responses.filter((r) => 'failed' in r);
  const totalCost = successful.reduce(
    (sum: number, r: any) => sum + parseFloat(r.cost?.charged || 0),
    0
  );
  return res.json({
    success: true,
    statusCode: 200,
    message: 'Model comparison completed',
    data: {
      responses: successful,
      failed,
      summary: {
        totalModels: modelIds.length,
        successful: successful.length,
        failed: failed.length,
        totalCost: totalCost.toFixed(6),
        executionTime,
      },
      timestamp: new Date().toISOString(),
    },
  });
});