import logger from '../config/logger.js';

// ── Intent Detection ─────────────────────────────────────────────────
// Two-tier: fast regex check + contextual analysis

const IMAGE_TRIGGER_PATTERNS = [
  // Explicit generation
  /\b(generate|create|make|draw|design|produce|render|craft|build)\b.{0,30}\b(image|picture|photo|illustration|poster|banner|logo|icon|thumbnail|mockup|ui|visual|graphic|artwork|infographic|diagram|flyer|cover|avatar|wallpaper|meme|cartoon|sketch|painting)\b/i,
  // Reverse order: "image of", "poster for"
  /\b(image|picture|photo|poster|banner|logo|thumbnail|mockup|illustration|icon)\b.{0,20}\b(of|for|about|showing|depicting|with)\b/i,
  // Direct commands
  /^(generate|create|make|draw|design|visualize|illustrate|render)\b.{0,10}\b(a|an|the|me|this)?\b/i,
  // Implicit design requests
  /\b(landing page design|website design|app design|ui design|ux design|brand identity|business card|social media post|instagram post|facebook cover|youtube thumbnail)\b/i,
  // "Show me" pattern
  /\bshow me\b.{0,20}\b(image|picture|visual|design|what.*looks? like)\b/i,
  // "I need a" pattern
  /\bi need\b.{0,15}\b(logo|poster|banner|design|image|graphic|illustration)\b/i,
  // Dalle/image model explicit
  /\b(dall-?e|dalle|midjourney|stable diffusion|image gen)\b/i,
];

// Patterns that indicate image MODIFICATION (only valid when previous message had an image)
const IMAGE_MODIFY_PATTERNS = [
  /\b(change|modify|edit|update|alter|adjust|tweak|refine|improve|redo|redo)\b.{0,20}\b(it|this|that|the image|the logo|the design|the poster)\b/i,
  /\b(make|do)\b.{0,10}\b(it|this|that|changes?)\b/i,
  /\b(can we|can you|could you|please)\b.{0,15}\b(change|modify|edit|update|adjust|tweak|make changes?)\b/i,
  /\b(different|another)\b.{0,15}\b(angle|version|style|color|variation|look)\b/i,
  /\b(more|less)\b.{0,10}\b(minimal|colorful|dark|bright|modern|professional|vibrant|abstract|detailed)\b/i,
  /\b(add|remove|replace)\b.{0,20}\b(gradient|shadow|text|color|background|border|element)\b/i,
  /\b(try|regenerate|redo|again)\b.{0,15}\b(with|in|using|but)\b/i,
  /\bwith (different|another|more|less)\b/i,
  /^(darker|brighter|bigger|smaller|simpler|bolder|cleaner|sharper|softer|warmer|cooler)\b/i,
  /\bnot (professional|good|right|what i wanted)\b/i,
];

// Patterns that should NOT trigger image gen (code, analysis, text, documents)
const ANTI_PATTERNS = [
  /\b(explain|analyze|compare|describe|tell me about|what is|how does|write code|implement|debug|fix)\b.*\b(image|design|poster)\b/i,
  /\b(code|script|function|algorithm|api|endpoint)\b/i,
  /```/,  // Code blocks
  /\b(doc|document|docx|pdf|report|essay|article|blog|paper|proposal|letter|resume|cv|email|memo|presentation|ppt|spreadsheet|excel|csv)\b/i,
  /\b(write|create|make|draft|prepare)\b.{0,15}\b(doc|document|docx|pdf|report|essay|article|blog|paper|proposal|letter|file|resume|cv|content|text|email|memo)\b/i,
];

export interface ImageIntent {
  isImageRequest: boolean;
  confidence: 'high' | 'medium' | 'low';
  extractedSubject: string;
  originalMessage: string;
}

/**
 * Detect if a message is requesting image generation.
 * Supports both direct requests and follow-up modifications.
 * @param message The user's latest message
 * @param conversationContext Optional conversation history to detect modifications
 */
export function detectImageIntent(
  message: string,
  conversationContext?: Array<{ role: string; content: string }>
): ImageIntent {
  const trimmed = message.trim();

  // Quick exit for very short messages or code
  if (trimmed.length < 5 || trimmed.startsWith('```')) {
    return { isImageRequest: false, confidence: 'low', extractedSubject: '', originalMessage: message };
  }

  // Check anti-patterns first
  for (const anti of ANTI_PATTERNS) {
    if (anti.test(trimmed)) {
      return { isImageRequest: false, confidence: 'high', extractedSubject: '', originalMessage: message };
    }
  }

  // Check direct trigger patterns
  for (const pattern of IMAGE_TRIGGER_PATTERNS) {
    if (pattern.test(trimmed)) {
      const subject = extractSubject(trimmed);
      return { isImageRequest: true, confidence: 'high', extractedSubject: subject, originalMessage: message };
    }
  }

  // Check modification patterns — only if previous conversation had an image
  if (conversationContext && conversationContext.length > 1) {
    const hadRecentImage = conversationContext.some((msg, i) =>
      msg.role === 'assistant' && (
        msg.content.includes('Generated Image') ||
        msg.content.includes('generated image') ||
        msg.content.includes('Download image') ||
        msg.content.includes('/api/uploads/images/') ||
        msg.content.includes('Generating image')
      )
    );

    if (hadRecentImage) {
      for (const pattern of IMAGE_MODIFY_PATTERNS) {
        if (pattern.test(trimmed)) {
          // Build a contextual subject from previous image + modification request
          const prevImageContext = getRecentImageContext(conversationContext);
          const subject = prevImageContext
            ? `${prevImageContext}. Modification: ${trimmed}`
            : trimmed;
          logger.info(`Image modification detected: "${trimmed}" → "${subject.substring(0, 80)}"`);
          return { isImageRequest: true, confidence: 'medium', extractedSubject: subject, originalMessage: message };
        }
      }
    }
  }

  return { isImageRequest: false, confidence: 'low', extractedSubject: '', originalMessage: message };
}

/**
 * Extract the subject/description from the user's message.
 */
function extractSubject(message: string): string {
  // Remove command words to get the actual subject
  let subject = message
    .replace(/^(please\s+)?(can you\s+)?(generate|create|make|draw|design|produce|render|craft|build|visualize|illustrate|show me)\s+(a|an|the|me|this)?\s*/i, '')
    .replace(/\b(image|picture|photo|illustration)\s+(of|for|about|showing|depicting)\s*/i, '')
    .trim();

  // If subject is too short, use the whole message
  if (subject.length < 3) subject = message;

  return subject;
}

// ── Prompt Enhancement ───────────────────────────────────────────────

interface PromptEnhanceOptions {
  style?: string;
  conversationContext?: Array<{ role: string; content: string }>;
}

/**
 * Enhance a basic prompt into a high-quality image generation prompt.
 * Uses conversation context for follow-up refinements.
 */
export function enhanceImagePrompt(
  subject: string,
  options: PromptEnhanceOptions = {}
): string {
  const { style, conversationContext } = options;

  // Check if this is a follow-up refinement
  let basePrompt = subject;
  if (conversationContext && conversationContext.length > 1) {
    const recentContext = getRecentImageContext(conversationContext);
    if (recentContext) {
      basePrompt = `${recentContext}. Refinement: ${subject}`;
    }
  }

  // Detect category and add style enhancers
  const category = detectCategory(basePrompt);
  const enhancers = getStyleEnhancers(category, style);

  // Build final prompt
  let enhanced = basePrompt;

  // Add quality enhancers if not already present
  if (!/(4k|8k|high.?res|hd|uhd|detailed|quality)/i.test(enhanced)) {
    enhanced += `, ${enhancers.quality}`;
  }

  // Add style if not already present
  if (!/(style|aesthetic|minimal|modern|vintage|retro|futuristic)/i.test(enhanced)) {
    enhanced += `, ${enhancers.style}`;
  }

  // Add lighting if not already present
  if (!/(lighting|light|lit|bright|dark|shadow|glow|neon)/i.test(enhanced)) {
    enhanced += `, ${enhancers.lighting}`;
  }

  logger.info(`Image prompt enhanced: "${subject}" → "${enhanced}"`);
  return enhanced;
}

/**
 * Look back through conversation for previous image-related context.
 */
function getRecentImageContext(messages: Array<{ role: string; content: string }>): string | null {
  // Look for the most recent image generation in the conversation
  for (let i = messages.length - 2; i >= Math.max(0, messages.length - 6); i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.content.includes('generated image')) {
      // Find the user message before this
      if (i > 0 && messages[i - 1].role === 'user') {
        return messages[i - 1].content;
      }
    }
    // Also check if previous user message was an image request
    if (msg.role === 'user' && detectImageIntent(msg.content).isImageRequest) {
      return msg.content;
    }
  }
  return null;
}

type ImageCategory = 'logo' | 'poster' | 'ui' | 'photo' | 'art' | 'business' | 'social' | 'general';

function detectCategory(prompt: string): ImageCategory {
  const lower = prompt.toLowerCase();
  if (/\blog[o|a]\b/i.test(lower)) return 'logo';
  if (/\b(poster|flyer|banner)\b/.test(lower)) return 'poster';
  if (/\b(ui|ux|interface|app|website|landing page|dashboard)\b/.test(lower)) return 'ui';
  if (/\b(photo|photograph|portrait|landscape)\b/.test(lower)) return 'photo';
  if (/\b(art|painting|illustration|drawing|sketch|anime)\b/.test(lower)) return 'art';
  if (/\b(business card|pitch deck|presentation|corporate)\b/.test(lower)) return 'business';
  if (/\b(social media|instagram|facebook|twitter|youtube|thumbnail)\b/.test(lower)) return 'social';
  return 'general';
}

function getStyleEnhancers(category: ImageCategory, customStyle?: string) {
  const styles: Record<ImageCategory, { quality: string; style: string; lighting: string }> = {
    logo: {
      quality: 'high resolution, vector-clean edges, scalable',
      style: 'modern minimalist design, professional branding',
      lighting: 'clean flat lighting, white background',
    },
    poster: {
      quality: '4K resolution, print-ready, sharp details',
      style: 'bold typography, eye-catching layout, vibrant colors',
      lighting: 'dramatic cinematic lighting, high contrast',
    },
    ui: {
      quality: 'crisp pixel-perfect details, retina display ready',
      style: 'modern UI design, clean layout, subtle shadows, rounded corners',
      lighting: 'soft ambient lighting, subtle gradients',
    },
    photo: {
      quality: '8K ultra-realistic, professional DSLR quality',
      style: 'photorealistic, natural composition',
      lighting: 'natural golden hour lighting, soft shadows',
    },
    art: {
      quality: 'highly detailed, masterful composition',
      style: 'artistic, expressive brushstrokes, rich colors',
      lighting: 'dramatic chiaroscuro lighting',
    },
    business: {
      quality: 'professional, clean, high resolution',
      style: 'corporate modern, elegant typography, trusted brand feel',
      lighting: 'bright professional studio lighting',
    },
    social: {
      quality: 'optimized for social media, vibrant, attention-grabbing',
      style: 'trendy, bold colors, engaging composition',
      lighting: 'bright, vibrant, high energy lighting',
    },
    general: {
      quality: 'high quality, detailed, 4K resolution',
      style: 'modern, visually appealing, professional',
      lighting: 'well-balanced natural lighting',
    },
  };

  const base = styles[category];
  if (customStyle) {
    return { ...base, style: customStyle };
  }
  return base;
}

// ── Provider Selection ───────────────────────────────────────────────

export function selectImageProvider(): 'gemini' | 'dalle' {
  // Gemini is free (1500/day), use as default
  // DALL-E as fallback (paid per image)
  return 'gemini';
}
