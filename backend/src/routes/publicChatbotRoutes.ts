import { Router } from 'express'
import { handleChatbotStream } from '../controllers/publicChatbotController.js'
import { chatbotBurstLimiter, chatbotDailyLimiter } from '../middleware/rateLimiter.js'

const router = Router()

// Daily cap is the safety net (50/day/IP), burst cap is the active throttle (15/hr/IP).
// Order matters — daily check first so the user sees the long-window message
// instead of "give it an hour" when they're actually blocked for the day.
router.post('/chatbot/stream', chatbotDailyLimiter, chatbotBurstLimiter, handleChatbotStream)

export default router
