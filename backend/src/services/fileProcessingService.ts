import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import logger from '../config/logger.js'

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Add OPENAI_API_KEY to your .env file.')
  }
  return new OpenAI({ apiKey })
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

  // Generate image with DALL-E
  static async generateImage(
    prompt: string,
    size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
    quality: 'standard' | 'hd' = 'standard'
  ): Promise<{
    imageUrl: string
    revisedPrompt: string
  }> {
    const response = await getOpenAI().images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality,
      response_format: 'url',
    })

    const imageData = response.data?.[0]
    return {
      imageUrl: imageData?.url || '',
      revisedPrompt: imageData?.revised_prompt || prompt,
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
