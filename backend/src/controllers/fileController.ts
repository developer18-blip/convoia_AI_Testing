import fs from 'fs'
import { Request, Response } from 'express'
import { asyncHandler, AppError } from '../middleware/errorHandler.js'
import { FileProcessingService } from '../services/fileProcessingService.js'
import { AIGatewayService } from '../services/aiGatewayService.js'
import { afterQueryMiddleware } from '../middleware/tokenTracker.js'
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js'
import logger from '../config/logger.js'
import prisma from '../config/db.js'

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
    include: { wallet: true },
  })

  if (!user) throw new AppError('User not found', 404)

  if (!user.wallet || user.wallet.balance <= 0) {
    FileProcessingService.cleanupFile(file.path)
    res.status(402).json({
      success: false,
      message: 'Insufficient wallet balance. Top up to continue.',
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

        // Route through the AI Gateway — respects user's selected model
        const aiResponse = await AIGatewayService.sendVisionMessage({
          userId: user.id,
          organizationId: orgId,
          modelId: resolvedModelId,
          prompt: prompt?.trim() || 'Please analyze this image and describe what you see in detail.',
          imageBase64: base64Image,
          mimeType,
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
          const { PDFParse } = await import('pdf-parse')
          const dataBuffer = fs.readFileSync(file.path)
          const parser = new PDFParse({ data: new Uint8Array(dataBuffer) })
          const result = await parser.getText()
          await parser.destroy()
          extractedText = result.text
          pageCount = result.total
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

        const wordCount = extractedText.split(/\s+/).filter((w) => w.length > 0).length
        const truncated = extractedText.length > 15000
        const processedText = extractedText.slice(0, 15000)

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

// Generate image with DALL-E
export const generateImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('Unauthorized', 401)

  const { prompt, size, quality } = req.body

  if (!prompt?.trim()) {
    throw new AppError('Prompt is required', 400)
  }

  // Get user and wallet
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { wallet: true },
  })

  if (!user) throw new AppError('User not found', 404)

  // DALL-E costs
  const imageCost = quality === 'hd' ? 0.08 : 0.04

  if (!user.wallet || user.wallet.balance < imageCost) {
    res.status(402).json({
      success: false,
      message: `Insufficient balance. Image generation costs $${imageCost}`,
      required: imageCost,
      current: user.wallet?.balance ?? 0,
    })
    return
  }

  // Generate image
  const result = await FileProcessingService.generateImage(prompt, size, quality)

  // Deduct cost from wallet
  await prisma.wallet.update({
    where: { userId: user.id },
    data: {
      balance: { decrement: imageCost },
      totalSpent: { increment: imageCost },
    },
  })

  await prisma.walletTransaction.create({
    data: {
      walletId: user.wallet!.id,
      amount: imageCost,
      type: 'debit',
      description: 'DALL-E image generation',
      reference: 'dall-e-3',
    },
  })

  logger.info(`Image generated for user ${user.id}, cost: $${imageCost}`)

  res.json({
    success: true,
    data: {
      imageUrl: result.imageUrl,
      revisedPrompt: result.revisedPrompt,
      cost: imageCost,
      size: size || '1024x1024',
      quality: quality || 'standard',
    },
    timestamp: new Date().toISOString(),
  })
})
