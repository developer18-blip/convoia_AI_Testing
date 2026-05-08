import { Request, Response } from 'express'
import axios from 'axios'
import { config } from '../config/env.js'
import logger from '../config/logger.js'
import { CHATBOT_SYSTEM_PROMPT, CHATBOT_LIMITS } from '../services/chatbotKnowledgeBase.js'

interface ChatbotMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * POST /api/public/chatbot/stream
 *
 * Anonymous visitor chatbot. Streams Anthropic Haiku 4.5 over SSE with the
 * Convoia knowledge-base system prompt. No auth, no wallet — server eats
 * the cost. Rate limiting is enforced upstream by chatbotBurstLimiter +
 * chatbotDailyLimiter (per-IP).
 *
 * Wire format mirrors /api/ai/query/stream so the frontend SSE consumer
 * can be a thin fork of useChat:
 *   data: {"type":"chunk","content":"..."}
 *   data: {"type":"done","tokens":{"input":N,"output":N},"cost":N,"model":"..."}
 *   data: [DONE]
 */
export const handleChatbotStream = async (req: Request, res: Response): Promise<void> => {
  const apiKey = config.apiKeys.anthropic
  if (!apiKey) {
    res.status(503).json({ success: false, message: 'Chatbot temporarily unavailable.' })
    return
  }

  // Validate input
  const messages: unknown = req.body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ success: false, message: 'messages array is required' })
    return
  }

  // Filter to valid shape, enforce role/content/length limits
  const cleaned: ChatbotMessage[] = []
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    const role = (m as any).role
    const content = (m as any).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string') continue
    if (content.length > CHATBOT_LIMITS.MAX_INPUT_CHARS) {
      res.status(400).json({
        success: false,
        message: `Message too long. Keep it under ${CHATBOT_LIMITS.MAX_INPUT_CHARS} characters.`,
      })
      return
    }
    cleaned.push({ role, content })
  }

  if (cleaned.length === 0) {
    res.status(400).json({ success: false, message: 'No valid messages provided' })
    return
  }

  // Cap history — keep only the most recent N turns. The first message in
  // history is preserved as the conversation anchor (matches aiGatewayService
  // trimToContextWindow pattern).
  const trimmed = cleaned.length > CHATBOT_LIMITS.MAX_HISTORY_TURNS
    ? cleaned.slice(-CHATBOT_LIMITS.MAX_HISTORY_TURNS)
    : cleaned

  // Last message must be from the user — otherwise Anthropic rejects.
  const last = trimmed[trimmed.length - 1]
  if (last.role !== 'user') {
    res.status(400).json({ success: false, message: 'Last message must be from user' })
    return
  }

  // SSE headers (X-Accel-Buffering=no disables nginx buffering)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  try {
    const upstream = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: CHATBOT_LIMITS.MODEL_ID,
        max_tokens: CHATBOT_LIMITS.MAX_OUTPUT_TOKENS,
        system: CHATBOT_SYSTEM_PROMPT,
        messages: trimmed,
        stream: true,
        temperature: 0.7,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: 60_000,
      },
    )

    let inputTokens = 0
    let outputTokens = 0
    let buffer = ''

    upstream.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine.startsWith('data: ')) continue
        try {
          const json = JSON.parse(trimmedLine.slice(6))
          if (json.type === 'message_start' && json.message?.usage) {
            inputTokens = json.message.usage.input_tokens || 0
          }
          if (json.type === 'content_block_delta' && json.delta?.text) {
            send({ type: 'chunk', content: json.delta.text })
          }
          if (json.type === 'message_delta' && json.usage) {
            outputTokens = json.usage.output_tokens || outputTokens
          }
        } catch {
          /* skip malformed */
        }
      }
    })

    upstream.data.on('end', () => {
      const inputCost = (inputTokens / 1_000_000) * CHATBOT_LIMITS.PRICE_INPUT_PER_M
      const outputCost = (outputTokens / 1_000_000) * CHATBOT_LIMITS.PRICE_OUTPUT_PER_M
      const totalCost = inputCost + outputCost
      send({
        type: 'done',
        tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
        cost: totalCost,
        model: 'Haiku 4.5',
        provider: 'anthropic',
      })
      res.write('data: [DONE]\n\n')
      res.end()

      logger.info(
        `[chatbot] ip=${req.ip} input=${inputTokens} output=${outputTokens} cost=$${totalCost.toFixed(6)}`,
      )
    })

    upstream.data.on('error', (err: Error) => {
      logger.error(`[chatbot] stream error: ${err.message}`)
      send({ type: 'chunk', content: '\n\n_(connection interrupted — please try again)_' })
      send({ type: 'done', tokens: { input: 0, output: 0, total: 0 }, cost: 0, model: 'Haiku 4.5', provider: 'anthropic' })
      res.write('data: [DONE]\n\n')
      res.end()
    })
  } catch (err: any) {
    const status = err.response?.status
    const reason = err.response?.data?.error?.message || err.message || 'Unknown error'
    logger.error(`[chatbot] upstream failed status=${status} reason=${reason}`)
    if (!res.headersSent) {
      res.status(502).json({ success: false, message: 'Chatbot upstream error. Please retry.' })
      return
    }
    send({ type: 'chunk', content: '\n\n_(error reaching the model — please try again)_' })
    send({ type: 'done', tokens: { input: 0, output: 0, total: 0 }, cost: 0, model: 'Haiku 4.5', provider: 'anthropic' })
    res.write('data: [DONE]\n\n')
    res.end()
  }
}
