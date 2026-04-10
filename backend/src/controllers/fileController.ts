import fs from 'fs'
import axios from 'axios'
import { Request, Response } from 'express'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { FileProcessingService } from '../services/fileProcessingService.js'
import { AIGatewayService } from '../services/aiGatewayService.js'
import { afterQueryMiddleware } from '../middleware/tokenTracker.js'
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js'
import { TokenWalletService } from '../services/tokenWalletService.js'
import { config } from '../config/env.js'
import logger from '../config/logger.js'
import prisma from '../config/db.js'
import { TOKEN_BASE_RATE, costAdjustedTokens } from '../config/tokenPackages.js'

// OCR scanned/image-based PDFs using AI vision models
async function ocrPdfWithVision(filePath: string): Promise<string | null> {
  const pdfBase64 = fs.readFileSync(filePath).toString('base64')

  // Try Anthropic first (native PDF support)
  if (config.apiKeys.anthropic) {
    try {
      logger.info('OCR: Using Anthropic document vision for scanned PDF')
      const resp = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            {
              type: 'text',
              text: 'Extract ALL text content from this document. Return the text exactly as written, preserving the structure and formatting. Do not add commentary — only return the extracted text.',
            },
          ],
        }],
      }, {
        headers: {
          'x-api-key': config.apiKeys.anthropic,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      })
      const text = resp.data?.content?.[0]?.text || ''
      if (text.length > 20) {
        logger.info(`OCR: Anthropic extracted ${text.length} chars from scanned PDF`)
        return text
      }
    } catch (err: any) {
      logger.error(`OCR Anthropic failed: ${err.message}`)
    }
  }

  // Fallback: Google Gemini (also supports PDF)
  if (config.apiKeys.google) {
    try {
      logger.info('OCR: Using Google Gemini for scanned PDF')
      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKeys.google}`,
        {
          contents: [{
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
              { text: 'Extract ALL text content from this document. Return the text exactly as written, preserving structure. Do not add commentary.' },
            ],
          }],
        },
        { timeout: 60000 }
      )
      const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text.length > 20) {
        logger.info(`OCR: Gemini extracted ${text.length} chars from scanned PDF`)
        return text
      }
    } catch (err: any) {
      logger.error(`OCR Google failed: ${err.message}`)
    }
  }

  return null
}

// Upload and process file
export const processFile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('Unauthorized', 401)
  if (!req.file) throw new AppError('No file uploaded', 400)

  const file = req.file
  const { prompt, modelId } = req.body
  const category = FileProcessingService.getFileCategory(file.mimetype)

  logger.info(`Processing file: ${file.originalname}, type: ${category}, size: ${file.size}`)

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  })

  if (!user) throw new AppError('User not found', 404)

  // Check token balance — vision/image needs ~2000 tokens minimum
  const tokenBal = await TokenWalletService.getBalance(user.id)
  const minRequired = category === 'image' ? 2000 : 500
  if (tokenBal.tokenBalance < minRequired) {
    FileProcessingService.cleanupFile(file.path)
    const isOrgMember = !!user.organizationId
    res.status(402).json({
      success: false,
      code: tokenBal.tokenBalance <= 0 ? 'NO_TOKENS' : 'INSUFFICIENT_TOKENS',
      message: isOrgMember
        ? `Insufficient tokens (${TokenWalletService.formatTokens(tokenBal.tokenBalance)} remaining). Contact your manager.`
        : `Insufficient tokens (${TokenWalletService.formatTokens(tokenBal.tokenBalance)} remaining).`,
      currentBalance: tokenBal.tokenBalance,
      estimatedRequired: minRequired,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    })
    return
  }

  const orgId = await getOrCreatePersonalOrg(user.id)

  try {
    switch (category) {
      case 'image': {
        // Read file as base64
        const imageBuffer = fs.readFileSync(file.path)
        const base64Image = imageBuffer.toString('base64')
        const mimeType = file.mimetype

        logger.info(`Processing image: ${mimeType}, ${Math.round(file.size / 1024)}KB, modelId: ${modelId || 'auto'}`)

        // Resolve which model to use for vision
        // If modelId provided, use it (gateway handles vision fallback if provider doesn't support it)
        // If no modelId, find any available vision-capable model
        let resolvedModelId = modelId

        if (!resolvedModelId) {
          const anyVisionModel = await prisma.aIModel.findFirst({
            where: {
              isActive: true,
              provider: { in: ['openai', 'anthropic', 'google'] },
            },
            orderBy: { inputTokenPrice: 'asc' },
          })
          if (!anyVisionModel) {
            throw new AppError('No vision-capable model available. Configure an API key for OpenAI, Anthropic, or Google.', 400)
          }
          resolvedModelId = anyVisionModel.id
        }

        // Cap vision output — min of user's balance and model hard limit (most models cap at 8192 for vision)
        const MODEL_VISION_LIMIT = 8192;
        const visionMaxOutput = Math.min(Math.max(tokenBal.tokenBalance - 2000, 500), MODEL_VISION_LIMIT);

        // Route through the AI Gateway — respects user's selected model
        const aiResponse = await AIGatewayService.sendVisionMessage({
          userId: user.id,
          organizationId: orgId,
          modelId: resolvedModelId,
          prompt: prompt?.trim() || 'Please analyze this image and describe what you see in detail.',
          imageBase64: base64Image,
          mimeType,
          maxOutputTokens: visionMaxOutput,
        })

        // Track usage and billing
        await afterQueryMiddleware(
          user.id,
          orgId,
          aiResponse.aiModel.id,
          `[Image analysis] ${prompt || 'Analyze image'}`,
          aiResponse.response,
          aiResponse.inputTokens,
          aiResponse.outputTokens,
          aiResponse.providerCost,
          aiResponse.customerPrice,
          aiResponse.markupPercentage
        )

        // Deduct tokens from wallet
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: costAdjustedTokens(aiResponse.customerPrice, aiResponse.totalTokens),
          reference: aiResponse.aiModel.id,
          description: `Vision: ${aiResponse.aiModel.name}`,
        })

        res.json({
          success: true,
          data: {
            type: 'image_analysis',
            response: aiResponse.response,
            tokensInput: aiResponse.inputTokens,
            tokensOutput: aiResponse.outputTokens,
            totalTokens: aiResponse.totalTokens,
            cost: aiResponse.customerPrice,
            model: aiResponse.aiModel.name,
            provider: aiResponse.aiModel.provider,
            fallbackUsed: aiResponse.fallbackUsed,
            fallbackReason: aiResponse.fallbackReason,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
          },
        })
        return
      }

      case 'document': {
        let extractedText = ''
        let pageCount = 0

        if (file.mimetype === 'application/pdf') {
          try {
            const { PDFParse } = await import('pdf-parse')
            const dataBuffer = fs.readFileSync(file.path)
            const parser = new PDFParse({ data: new Uint8Array(dataBuffer) })
            const result = await parser.getText()
            await parser.destroy()
            extractedText = result.text || ''
            pageCount = result.total || 0
            logger.info(`PDF extracted: ${file.originalname}, pages=${pageCount}, chars=${extractedText.length}`)
          } catch (pdfErr: any) {
            logger.error(`PDF extraction failed for ${file.originalname}: ${pdfErr.message}. Will attempt OCR.`)
            // Do NOT fall back to raw binary read — it produces garbage PDF commands
            // that bypass OCR. Let the meaningfulText check below handle OCR instead.
          }

          // Validate extracted text contains actual readable content, not PDF garbage
          // A readable document should have common English words or word-like patterns
          if (extractedText.length > 0) {
            const readableWordCount = (extractedText.match(/\b[a-zA-Z]{2,}\b/g) || []).length
            const charRatio = readableWordCount / Math.max(extractedText.length / 5, 1)
            if (charRatio < 0.1) {
              // Less than 10% readable words — likely PDF structural commands or garbled encoding
              logger.warn(`PDF text appears garbled (${readableWordCount} readable words in ${extractedText.length} chars, ratio=${charRatio.toFixed(2)}). Discarding for OCR.`)
              extractedText = ''
            }
          }
        } else if (
          file.mimetype.includes('wordprocessingml') ||
          file.mimetype === 'application/msword'
        ) {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ path: file.path })
          extractedText = result.value
        } else {
          // Plain text
          extractedText = fs.readFileSync(file.path, 'utf-8')
        }

        // Check if extracted text is meaningful (scanned/image-based PDFs, failed extraction)
        if (file.mimetype === 'application/pdf') {
          const meaningfulText = extractedText
            .replace(/--\s*\d+\s*of\s*\d+\s*--/g, '') // strip page markers
            .replace(/\s+/g, '')
            .trim()
          if (meaningfulText.length < 50 && file.size > 1000) {
            logger.info(`PDF text extraction produced ${meaningfulText.length} meaningful chars (file size: ${file.size} bytes). Attempting vision OCR...`)
            const ocrText = await ocrPdfWithVision(file.path)
            if (ocrText) {
              extractedText = ocrText
              pageCount = pageCount || 1
              logger.info(`OCR succeeded: ${ocrText.length} chars extracted from PDF`)
            } else {
              logger.warn(`OCR also failed for ${file.originalname}. Document may be empty or unsupported format.`)
            }
          }
        }

        const wordCount = extractedText.split(/\s+/).filter((w) => w.length > 0).length
        const truncated = extractedText.length > 15000
        const processedText = extractedText.slice(0, 15000)

        logger.info(`Document processed: ${file.originalname}, words=${wordCount}, chars=${processedText.length}, empty=${processedText.length === 0}`)

        if (processedText.length === 0) {
          // PDF may be scanned/image-based with no text layer and OCR also failed
          res.json({
            success: true,
            data: {
              type: 'document',
              extractedText: `[This PDF appears to be scanned or image-based. No extractable text was found in "${file.originalname}" (${pageCount} pages, ${Math.round(file.size / 1024)}KB). Try uploading the pages as images instead.]`,
              truncated: false,
              originalLength: 0,
              pageCount,
              wordCount: 0,
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              warning: 'No text extracted — PDF may be scanned/image-based',
            },
          })
          return
        }

        res.json({
          success: true,
          data: {
            type: 'document',
            extractedText: processedText,
            truncated,
            originalLength: extractedText.length,
            pageCount,
            wordCount,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
          },
        })
        return
      }

      case 'audio': {
        // Audio transcription still uses OpenAI Whisper (no multi-provider alternative yet)
        const OpenAI = (await import('openai')).default
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
          throw new AppError('Audio transcription requires an OpenAI API key (Whisper). Add OPENAI_API_KEY to your .env file.', 500)
        }
        const openai = new OpenAI({ apiKey })
        const audioStream = fs.createReadStream(file.path)

        const transcription = await openai.audio.transcriptions.create({
          file: audioStream,
          model: 'whisper-1',
          response_format: 'verbose_json',
        })

        const transcript = (transcription as unknown as { text: string }).text || ''
        const duration = (transcription as unknown as { duration: number }).duration || 0

        res.json({
          success: true,
          data: {
            type: 'audio_transcript',
            transcript,
            duration: Math.round(duration),
            fileName: file.originalname,
            fileSize: file.size,
          },
        })
        return
      }

      case 'video': {
        res.json({
          success: true,
          data: {
            type: 'video',
            fileName: file.originalname,
            fileSize: file.size,
            message: 'Video support coming soon. Currently only audio extraction is supported.',
          },
        })
        return
      }

      default:
        throw new AppError('Unsupported file type', 400)
    }
  } catch (err) {
    if (err instanceof AppError) throw err

    const message = err instanceof Error ? err.message : 'File processing failed'
    logger.error('File processing error:', err)

    if (message.includes('rate_limit') || message.includes('Rate limit') || message.includes('429')) {
      throw new AppError('AI service is busy. Please try again in a moment.', 429)
    }
    if (message.includes('invalid_image') || message.includes('Could not process')) {
      throw new AppError('The image could not be processed. Please try a different format (JPG or PNG).', 400)
    }

    throw new AppError(message, 500)
  } finally {
    // Always cleanup temp file
    FileProcessingService.cleanupFile(file.path)
  }
})

// Generate image — Gemini (default, free) or DALL-E (fallback)
export const generateImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('Unauthorized', 401)

  const { prompt, size, quality, provider } = req.body

  if (!prompt?.trim()) {
    throw new AppError('Prompt is required', 400)
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  })

  if (!user) throw new AppError('User not found', 404)

  // Check token balance
  const imgTokenBal = await TokenWalletService.getBalance(user.id)
  if (imgTokenBal.tokenBalance < 500) {
    res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: 'You need more tokens to generate images.',
      currentBalance: imgTokenBal.tokenBalance,
      action: 'BUY_TOKENS',
    })
    return
  }

  // Generate image (Gemini first, DALL-E fallback)
  const result = await FileProcessingService.generateImage(prompt, size, quality, provider)

  // Token cost: Gemini is cheaper (uses actual token count ~1300), DALL-E flat 1000
  const imageTokenCost = result.provider === 'gemini' ? 500 : 1000
  await TokenWalletService.deductTokens({
    userId: user.id,
    tokens: imageTokenCost,
    reference: result.provider === 'gemini' ? 'gemini-2.5-flash-image' : 'dall-e-3',
    description: `Image generation (${result.provider === 'gemini' ? 'Gemini' : 'DALL-E'})`,
  })

  const providerLabel = result.provider === 'gemini' ? 'Gemini Flash' : 'DALL-E 3'
  logger.info(`Image generated via ${providerLabel} for user ${user.id}, tokens: ${imageTokenCost}`)

  // Log usage for image generation
  try {
    const imgModelName = result.provider === 'gemini' ? 'gemini-2.5-flash-image' : 'dall-e-3'
    const imgModel = await prisma.aIModel.findFirst({ where: { modelId: imgModelName } })
    if (imgModel) {
      await prisma.usageLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId || undefined,
          modelId: imgModel.id,
          prompt: prompt.substring(0, 500),
          response: `[Image generated: ${result.revisedPrompt?.substring(0, 200) || prompt.substring(0, 200)}]`,
          tokensInput: 0, tokensOutput: imageTokenCost, totalTokens: imageTokenCost,
          providerCost: 0, markupPercentage: 20, customerPrice: imageTokenCost * TOKEN_BASE_RATE,
          status: 'completed',
        },
      })
    }
  } catch { /* silent — don't fail image gen if logging fails */ }

  res.json({
    success: true,
    data: {
      imageUrl: result.imageUrl,
      revisedPrompt: result.revisedPrompt,
      tokensUsed: imageTokenCost,
      size: size || '1024x1024',
      quality: quality || 'standard',
      provider: providerLabel,
    },
    timestamp: new Date().toISOString(),
  })
})
