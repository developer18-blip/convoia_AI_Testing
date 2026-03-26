import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import OpenAI from 'openai'
import logger from '../config/logger.js'

const IMAGES_DIR = path.join(process.cwd(), 'uploads', 'images')
// Ensure directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true })
}

/** Save image data to disk, return permanent API URL */
function saveImageToDisk(data: Buffer | string, ext = 'png'): string {
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  const filePath = path.join(IMAGES_DIR, filename)

  if (typeof data === 'string') {
    // Base64 string
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
  } else {
    fs.writeFileSync(filePath, data)
  }

  // Return URL path (served via express.static at /api/uploads)
  return `/api/uploads/images/${filename}`
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Add OPENAI_API_KEY to your .env file.')
  }
  return new OpenAI({ apiKey })
}

function getGoogleKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!key) throw new Error('Google AI API key not configured.')
  return key
}

export class FileProcessingService {
  // Process image — send to vision model
  static async processImage(
    filePath: string,
    userPrompt: string,
    _modelId: string
  ): Promise<{
    response: string
    tokensInput: number
    tokensOutput: number
  }> {
    try {
      const imageData = fs.readFileSync(filePath)
      const base64 = imageData.toString('base64')
      const mimeType = this.getMimeType(filePath)

      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: userPrompt || 'Please analyze this image and describe what you see.',
              },
            ],
          },
        ],
        max_tokens: 2000,
      })

      return {
        response: response.choices[0].message.content || '',
        tokensInput: response.usage?.prompt_tokens || 0,
        tokensOutput: response.usage?.completion_tokens || 0,
      }
    } finally {
      this.cleanupFile(filePath)
    }
  }

  // Process PDF — extract text
  static async processPDF(
    filePath: string,
    _userPrompt: string
  ): Promise<{
    extractedText: string
    pageCount: number
  }> {
    try {
      const { PDFParse } = await import('pdf-parse')
      const dataBuffer = fs.readFileSync(filePath)
      const parser = new PDFParse({ data: new Uint8Array(dataBuffer) })
      const result = await parser.getText()
      await parser.destroy()

      return {
        extractedText: result.text,
        pageCount: result.total,
      }
    } finally {
      this.cleanupFile(filePath)
    }
  }

  // Process Word document
  static async processWord(filePath: string): Promise<{ extractedText: string }> {
    try {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return { extractedText: result.value }
    } finally {
      this.cleanupFile(filePath)
    }
  }

  // Process audio — transcribe with Whisper
  static async transcribeAudio(filePath: string): Promise<{ transcript: string }> {
    try {
      const audioFile = fs.createReadStream(filePath)

      const transcription = await getOpenAI().audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'text',
      })

      return {
        transcript: transcription as unknown as string,
      }
    } finally {
      this.cleanupFile(filePath)
    }
  }

  // Generate image — tries Gemini first (free, high limits), falls back to DALL-E
  static async generateImage(
    prompt: string,
    size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
    quality: 'standard' | 'hd' = 'standard',
    provider?: 'gemini' | 'dalle' | 'gpt-image-1'
  ): Promise<{
    imageUrl: string
    revisedPrompt: string
    provider: string
  }> {
    const preferredProvider = provider || 'gemini'

    // GPT Image 1 (explicit choice)
    if (preferredProvider === 'gpt-image-1') {
      return await this.generateWithGPTImage(prompt)
    }

    // Try Gemini first (free tier, 1500/day)
    if (preferredProvider === 'gemini') {
      try {
        return await this.generateImageGemini(prompt)
      } catch (err: any) {
        logger.warn(`Gemini image generation failed, falling back to DALL-E: ${err.message}`)
        // Fall through to DALL-E
      }
    }

    // DALL-E fallback (or explicit choice)
    return await this.generateImageDallE(prompt, size, quality)
  }

  // Generate image with Gemini 2.5 Flash Image
  private static async generateImageGemini(prompt: string): Promise<{
    imageUrl: string
    revisedPrompt: string
    provider: string
  }> {
    const apiKey = getGoogleKey()
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
      {
        contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      },
      {
        params: { key: apiKey },
        timeout: 60000,
      }
    )

    const parts = response.data?.candidates?.[0]?.content?.parts || []
    let imageUrl = ''
    let revisedPrompt = prompt

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        // Save base64 image to disk for permanent storage
        const ext = part.inlineData.mimeType.split('/')[1] || 'png'
        imageUrl = saveImageToDisk(part.inlineData.data, ext)
      }
      if (part.text) {
        revisedPrompt = part.text
      }
    }

    if (!imageUrl) {
      throw new Error('Gemini did not return an image')
    }

    return { imageUrl, revisedPrompt, provider: 'gemini' }
  }

  // Generate image with DALL-E 3
  private static async generateImageDallE(
    prompt: string,
    size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
    quality: 'standard' | 'hd' = 'standard'
  ): Promise<{
    imageUrl: string
    revisedPrompt: string
    provider: string
  }> {
    // Request base64 directly to avoid expiring URLs
    const response = await getOpenAI().images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      response_format: 'b64_json',
    })

    const imageData = response.data?.[0]
    if (!imageData?.b64_json) {
      throw new Error('DALL-E did not return image data')
    }

    // Save to disk for permanent storage
    const imageUrl = saveImageToDisk(imageData.b64_json, 'png')

    return {
      imageUrl,
      revisedPrompt: imageData.revised_prompt || prompt,
      provider: 'dalle',
    }
  }

  /**
   * Generate/edit image using GPT Image 1 (OpenAI Responses API)
   * Supports both text-to-image and image editing (with input image)
   */
  static async generateWithGPTImage(
    prompt: string,
    inputImageUrl?: string,
  ): Promise<{ imageUrl: string; revisedPrompt: string; provider: string }> {
    // Build the input content
    const input: any[] = []

    // If input image provided, add it
    if (inputImageUrl) {
      // Read image from disk if it's a local path
      let imageData: string
      if (inputImageUrl.startsWith('/api/uploads/')) {
        const filePath = path.join(process.cwd(), inputImageUrl.replace('/api/', ''))
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath)
          imageData = `data:image/png;base64,${buffer.toString('base64')}`
          input.push({ type: 'input_image', image_url: imageData })
        }
      } else if (inputImageUrl.startsWith('data:')) {
        input.push({ type: 'input_image', image_url: inputImageUrl })
      } else if (inputImageUrl.startsWith('http')) {
        input.push({ type: 'input_image', image_url: inputImageUrl })
      }
    }

    input.push({ type: 'input_text', text: prompt })

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
    })

    const data: any = await response.json()

    if (data.error) {
      throw new Error(data.error.message || 'GPT Image 1 failed')
    }

    const imageB64 = data.data?.[0]?.b64_json
    if (!imageB64) {
      throw new Error('GPT Image 1 did not return image data')
    }

    const imageUrl = saveImageToDisk(imageB64, 'png')

    return {
      imageUrl,
      revisedPrompt: prompt,
      provider: 'gpt-image-1',
    }
  }

  // Get file type category
  static getFileCategory(mimetype: string): 'image' | 'document' | 'audio' | 'video' {
    if (mimetype.startsWith('image/')) return 'image'
    if (mimetype.startsWith('audio/')) return 'audio'
    if (mimetype.startsWith('video/')) return 'video'
    return 'document'
  }

  static getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.mp4': 'video/mp4',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  static cleanupFile(filePath: string) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      logger.error('Failed to cleanup file:', err)
    }
  }
}
