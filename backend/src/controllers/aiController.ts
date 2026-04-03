import { Request, Response } from 'express';
import AIGatewayService from '../services/aiGatewayService.js';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { afterQueryMiddleware, estimateCost } from '../middleware/tokenTracker.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import { NotificationService } from '../services/notificationService.js';
import { needsWebSearch, searchWeb } from '../services/webSearchService.js';
import { detectImageIntent, enhanceImagePrompt } from '../services/imageIntentService.js';
import { FileProcessingService } from '../services/fileProcessingService.js';
import { getCachedResponse, setCachedResponse } from '../services/modelRecommendationService.js';
import { getUserMemoryPrompt } from '../services/userMemoryService.js';
import { processMemoryForQuery } from '../services/vectorMemoryService.js';
import { analyzeQuery, getClarificationSystemPrompt, getDeepResearchPrompt, buildRefinementPrompt } from '../services/thinkingService.js';
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
  void await prisma.hourlySession.findFirst({
    where: {
      userId: user.id,
      modelId,
      isActive: true,
      isExpired: false,
      endTime: { gt: new Date() },
    },
  });
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
  void await estimateCost(finalModelId, inputText);
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

  // Deduct tokens from wallet
  await TokenWalletService.deductTokens({
    userId: user.id,
    tokens: aiResponse.totalTokens,
    reference: aiResponse.aiModel.id,
    description: `Query: ${aiResponse.aiModel.name}`,
  });

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
    const { modelId, messages, industry, agentId, thinkingEnabled, referenceImage } = req.body;
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
        const imageTokenCost = result.provider === 'gemini' ? 1300 : 1000;
        await TokenWalletService.deductTokens({ userId: req.user.userId, tokens: imageTokenCost, reference: `image-gen-${Date.now()}`, description: `Image generation (${streamModelCheck.name})` });
        const imageContent = `\n\n![Generated Image](${result.imageUrl})\n\n*"${result.revisedPrompt}"*\n\n[Download image](${result.imageUrl})`;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: imageContent })}\n\n`);
        const imgCustomerPrice = imageTokenCost * 0.000002; // ~$0.002 per 1K tokens
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

    // Check token balance — estimate includes system prompt (~500 tokens) + all message history
    const streamTokenBalance = await TokenWalletService.getBalance(user.id);
    const inputText = messages.map((m: any) => m.content).join(' ');
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

    // ── IMAGE INTENT DETECTION ──────────────────────────────────
    // Check if the latest user message is requesting image generation.
    // If so, route to image pipeline instead of chat model.
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
    const lastUserText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
    const imageIntent = detectImageIntent(lastUserText, messages);

    if (imageIntent.isImageRequest) {
      logger.info(`Image intent detected (${imageIntent.confidence}): "${lastUserText.substring(0, 80)}"`);

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
          conversationContext: messages,
        });

        res.write(`data: ${JSON.stringify({ type: 'chunk', content: `**Generating image:** "${enhancedPrompt.substring(0, 100)}..."\n\n` })}\n\n`);

        // Generate image (Gemini first, DALL-E fallback) — pass reference image if available
        const result = await FileProcessingService.generateImage(enhancedPrompt, '1024x1024', 'standard', undefined, referenceImage);

        // Deduct tokens (flat cost for image gen)
        const imageTokenCost = result.provider === 'gemini' ? 1300 : 1000;
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: imageTokenCost,
          reference: `image-gen-${Date.now()}`,
          description: `Image generation (${result.provider === 'gemini' ? 'Gemini' : 'DALL-E'})`,
        });

        // Send image result via SSE
        const imageContent = [
          `\n\n![Generated Image](${result.imageUrl})`,
          `\n\n*"${result.revisedPrompt}"*`,
          `\n\n[Download image](${result.imageUrl})`,
        ].join('');

        res.write(`data: ${JSON.stringify({ type: 'chunk', content: imageContent })}\n\n`);

        // Log usage — find the actual image model ID
        let imageModelId = finalModelId;
        try {
          const imgModelName = result.provider === 'gemini' ? 'gemini-2.5-flash-image' : 'dall-e-3';
          const imgModel = await prisma.aIModel.findFirst({ where: { modelId: imgModelName } });
          if (imgModel) imageModelId = imgModel.id;
        } catch { /* use chat model as fallback */ }

        const imgCustomerPrice = imageTokenCost * 0.000002;

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

    // Pre-query cost estimate (for logging/display)
    const _estimate = await estimateCost(finalModelId, inputText);
    void _estimate; // used for future budget pre-check

    // Active session check
    const _activeSession = await prisma.hourlySession.findFirst({
      where: { userId: user.id, modelId: finalModelId, isActive: true, isExpired: false, endTime: { gt: new Date() } },
    });
    void _activeSession; // used for future session-based pricing

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
    let memoryPrompt = '';
    try {
      memoryPrompt = await processMemoryForQuery(user.id, lastUserText);
    } catch {
      // Fallback to simple memory if vector service fails
      try { memoryPrompt = await getUserMemoryPrompt(user.id); } catch { /* silent */ }
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
    const streamMaxOutput = Math.max(streamTokenBalance.tokenBalance - estimatedInputTokens, 200);

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
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    const rawUserContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    // Extract actual user question if document context is embedded
    const docSeparator = '---\n\nUser question: ';
    const hasDocContext = rawUserContent.includes('Here is the attached document content:');
    const userQuery = hasDocContext && rawUserContent.includes(docSeparator)
      ? rawUserContent.split(docSeparator).pop()?.trim() || rawUserContent
      : rawUserContent;
    let enrichedMessages = messages;

    if (userQuery && needsWebSearch(userQuery, hasDocContext)) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Searching the web...' })}\n\n`);
        const searchResult = await searchWeb(userQuery, 5);
        if (searchResult.searched && searchResult.results.length > 0) {
          webSearched = true;
          // Append search data to user message (formatting rules go in system prompt below)
          const searchPrefix = `\n\n[LIVE WEB SEARCH DATA — searched on ${new Date().toISOString().split('T')[0]}]\n\n${searchResult.contextText}`;
          enrichedMessages = [...messages];
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
      const analysis = analyzeQuery(userQuery, enrichedMessages);
      logger.info(`Deep research: depth=${analysis.depthLevel}, task=${analysis.taskType}, confidence=${analysis.confidenceScore.toFixed(2)}, hypotheses=${analysis.hypotheses.length}, clarify=${analysis.needsClarification}`);

      if (analysis.needsClarification) {
        // ── Stage 2: Clarification — ask smart questions instead of guessing ──
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Analyzing your question...' })}\n\n`);
        agentConfig = {
          systemPrompt: getClarificationSystemPrompt(analysis),
          temperature: 0.3,
          maxTokens: 1000,
          topP: 0.9,
          name: agentConfig?.name || 'AI',
        };
        useProviderThinking = false;

      } else {
        // ── Stage 3 + 4: Deep Research → Refinement ──
        res.write(`data: ${JSON.stringify({ type: 'status', content: 'Identifying problem scope...' })}\n\n`);

        try {
          // Brief pause for UX (shows status before heavy processing)
          await new Promise(r => setTimeout(r, 300));

          if (analysis.hypotheses.length > 0 && !streamEnded) {
            res.write(`data: ${JSON.stringify({ type: 'status', content: 'Building hypotheses...' })}\n\n`);
            await new Promise(r => setTimeout(r, 400));
          }

          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Researching from multiple angles...' })}\n\n`);

          // Pass 1: Deep Research (non-streaming)
          // Combines hypothesis building + multi-angle analysis in one call
          const researchPrompt = getDeepResearchPrompt(analysis);
          const pass1MaxTokens = analysis.depthLevel === 'research'
            ? Math.min(Math.floor(streamMaxOutput * 0.5), 6144)
            : Math.min(Math.floor(streamMaxOutput * 0.4), 4096);

          const pass1Result = await AIGatewayService.sendMessage({
            userId: user.id,
            organizationId,
            modelId: finalModelId,
            messages: enrichedMessages,
            agentConfig: {
              systemPrompt: researchPrompt,
              temperature: 0.3,
              maxTokens: pass1MaxTokens,
              topP: 0.9,
              name: agentConfig?.name || 'AI',
            },
            maxOutputTokens: pass1MaxTokens,
            memoryContext: memoryPrompt || undefined,
            thinkingEnabled: true, // native thinking for Anthropic/DeepSeek
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
            })}\n\n`);
          }

          // Stage 4: Iterative Refinement — self-critique + polish
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Validating and refining...' })}\n\n`);

          const refinementPrompt = buildRefinementPrompt(pass1Result.response, userQuery);
          enrichedMessages = [
            ...enrichedMessages.slice(0, -1),
            { role: 'user', content: refinementPrompt },
          ];

          agentConfig = {
            systemPrompt: 'You are a senior expert delivering a polished, consultant-grade response. Follow the output format exactly. Use markdown. Be thorough but concise — every sentence must earn its place.',
            temperature: 0.4,
            maxTokens: agentConfig?.maxTokens || 16384,
            topP: 0.9,
            name: agentConfig?.name || 'AI',
          };
          useProviderThinking = false;

          logger.info(`Deep research Pass 1 complete: ${pass1Result.response.length} chars, ${pass1ExtraInputTokens + pass1ExtraOutputTokens} tokens, depth=${analysis.depthLevel}. Starting refinement.`);

        } catch (pass1Err: any) {
          // Pass 1 failed — fall back to normal streaming with thinking enabled
          logger.error(`Deep research Pass 1 failed, falling back to single-pass: ${pass1Err.message}`);
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Processing...' })}\n\n`);
          useProviderThinking = true;
        }
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

              // 2. Deduct tokens from TokenWallet
              try {
                await TokenWalletService.deductTokens({
                  userId: user.id,
                  tokens: totalTokensUsed,
                  reference: aiModel.id,
                  description: `Query: ${aiModel.name}${pass1ExtraInputTokens > 0 ? ' (deep think)' : ''}`,
                });
              } catch (deductErr) {
                logger.error('Token deduction failed:', deductErr);
              }

              if (!streamEnded && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({
                  type: 'done',
                  model: aiModel.name,
                  provider: aiModel.provider,
                  tokens: { input: inputTokens, output: outputTokens, total: totalTokensUsed },
                  tokensUsed: totalTokensUsed,
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
        onError: (error: Error & { response?: { data?: any; status?: number } }) => {
          const providerErr = error.response?.data;
          logger.error(`Stream error: ${error.message}`, {
            status: error.response?.status,
            provider_error: providerErr?.error?.message || providerErr?.message || undefined,
            provider_type: providerErr?.error?.type || undefined,
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
    return res.status(402).json({
      success: false,
      code: 'NO_TOKENS',
      message: 'You have no tokens remaining.',
      currentBalance: 0,
    });
  }
  if (compareTokenBal.tokenBalance < estimatedTotal) {
    return res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: `Comparing ${modelIds.length} models requires ~${TokenWalletService.formatTokens(estimatedTotal)} tokens. You have ${TokenWalletService.formatTokens(compareTokenBal.tokenBalance)}.`,
      currentBalance: compareTokenBal.tokenBalance,
      estimatedRequired: estimatedTotal,
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
        // Deduct tokens for this model's response
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: aiResponse.totalTokens,
          reference: aiResponse.aiModel.id,
          description: `Compare: ${aiResponse.aiModel.name}`,
        });
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