/**
 * Hybrid Web Search Service
 *
 * Architecture:
 * 1. Check cache → return if fresh
 * 2. Try DuckDuckGo (FREE) → scrape + extract content
 * 3. Score results → if confidence < 0.6, fallback to Tavily
 * 4. Cache results with TTL
 *
 * Cost optimization: DuckDuckGo is free, Tavily only on fallback
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  image?: string;
  siteName?: string;
  snippet?: string;
}

export interface WebSearchResponse {
  searched: boolean;
  query: string;
  source: 'cache' | 'perplexity' | 'duckduckgo' | 'tavily' | 'none';
  confidence: number;
  results: SearchResult[];
  contextText: string;
}

// Map time-sensitivity to DDG df filter + Perplexity search_recency_filter
function getRecencyFilter(query: string): { ddg: string; perplexity: 'day' | 'week' | 'month' | 'year' | null } {
  const q = query.toLowerCase();
  if (/\b(breaking|happening now|live|right now|today|tonight|this morning|just)\b/.test(q)) {
    return { ddg: 'd', perplexity: 'day' };
  }
  if (/\b(this week|latest|recent|news|update|trending)\b/.test(q)) {
    return { ddg: 'w', perplexity: 'week' };
  }
  if (/\b(this month|current|newest)\b/.test(q)) {
    return { ddg: 'm', perplexity: 'month' };
  }
  if (/\b(20(2[5-9]|[3-9]\d))\b/.test(q)) {
    return { ddg: 'y', perplexity: 'year' };
  }
  return { ddg: '', perplexity: null };
}

// ── Intelligent Query Classification ────────────────────────────────
// Uses a scoring system instead of binary pattern matching.
// Requires multiple signals to trigger search — single keywords alone won't.
// Inspired by how ChatGPT/Claude decide when to invoke web search.

const NEWS_PATTERNS = [
  /\b(news|headline|breaking|update|happening|latest|trending)\b/i,
  /\b(today|this morning|tonight|this week|this month)\b/i,
];

function isTimeSensitive(query: string): boolean {
  return NEWS_PATTERNS.some(p => p.test(query))
    || /\b(current|latest|recent|today|now|this week|this month|this year|20[2-3]\d)\b/i.test(query)
    || /\b(news|war|election|crisis|update|happening|score|price|stock)\b/i.test(query);
}

/**
 * Intelligent web search detection using weighted scoring.
 *
 * Design principles (matching ChatGPT/Claude behavior):
 * - Single keywords like "compare", "analyze", "best" are NOT enough
 * - Need COMBINATION of signals (temporal + topic, or explicit request)
 * - Document/file analysis should NEVER trigger search
 * - Creative/coding tasks should NEVER trigger search
 * - Only search when the user clearly needs fresh/external information
 */
export function needsWebSearch(query: string, hasDocumentContext = false): boolean {
  // Very short queries or document analysis → never search
  if (query.length < 15) return false;
  if (hasDocumentContext) return false;

  // ── ABSOLUTE NEGATIVES — skip search entirely ──
  const SKIP_PATTERNS = [
    // Document/file analysis
    /\b(this document|this pdf|this file|the file|the document|attached|uploaded|the text above)\b/i,
    /\b(analyze this|summarize this|explain this|read this|review this)\b/i,
    /^here is the attached document/i,
    // Creative/writing tasks
    /^(write|create|draft|compose|generate|make)\b/i,
    /\b(poem|story|essay|email|letter|script|song|blog post|article)\b.*\b(about|for|on)\b/i,
    // Coding tasks
    /\b(code|function|class|variable|bug|error|syntax|debug|fix|refactor|optimize|implement)\b/i,
    /\b(python|javascript|typescript|java|rust|go|html|css|sql|react|node)\b/i,
    // Translation/transformation
    /^(translate|convert|rewrite|paraphrase|simplify|rephrase)\b/i,
    // General knowledge that doesn't change
    /^(explain|teach me|what is|what are|how does|how do|why does|why do|define)\b.*\b(work|mean|function|concept|theory|algorithm|principle)\b/i,
    // Conversational
    /^(hello|hi|hey|good morning|good evening|how are you|thank you|thanks|ok|okay|sure|yes|no|bye)\b/i,
    // Math/calculation
    /^(calculate|solve|compute|what is \d)/i,
    // Conversation references
    /\b(you said|you mentioned|earlier|above|previous|last message|in our conversation)\b/i,
  ];
  if (SKIP_PATTERNS.some(p => p.test(query))) return false;

  // ── EXPLICIT SEARCH REQUESTS — always search ──
  if (/\bsearch\s+(the\s+)?(web|internet|online|for)\b/i.test(query)) return true;
  if (/\b(look up|google|search for|find me|browse)\b/i.test(query)) return true;

  // ── SCORING SYSTEM — accumulate evidence ──
  let score = 0;

  // Strong temporal signals (+3) — user wants CURRENT info
  if (/\b(today|right now|currently|at the moment|as of now)\b/i.test(query)) score += 3;
  if (/\b(breaking|happening now|live|real.?time)\b/i.test(query)) score += 3;
  if (/\b(news|headline|trending|viral)\b/i.test(query)) score += 3;

  // Moderate temporal signals (+2)
  if (/\b(latest|newest|recent|this week|this month|this year)\b/i.test(query)) score += 2;
  if (/\b(20(2[5-9]|[3-9]\d))\b/.test(query)) score += 2; // Future years or very recent

  // Real-time data — need BOTH topic + freshness indicator (+3 for combo)
  if (/\b(price|stock|market|crypto|bitcoin|ethereum|nasdaq)\b/i.test(query) &&
      /\b(current|now|today|live|latest|what is)\b/i.test(query)) score += 3;
  if (/\b(weather|forecast|temperature)\b/i.test(query) &&
      /\b(today|tomorrow|this week|in|at)\b/i.test(query)) score += 3;
  if (/\b(score|match|game|result)\b/i.test(query) &&
      /\b(today|last night|yesterday|live|final)\b/i.test(query)) score += 3;
  if (/\b(election|vote|poll)\b/i.test(query) &&
      /\b(result|winner|latest|current|update)\b/i.test(query)) score += 3;

  // Product/service research — need BOTH comparison intent + product category (+2 for combo)
  if (/\b(compare|vs|versus|comparison|which is better)\b/i.test(query) &&
      /\b(product|phone|laptop|car|service|plan|tool|app|software|camera|tablet|watch|tv)\b/i.test(query)) score += 2;
  if (/\b(best|top \d+|review|recommend)\b/i.test(query) &&
      /\b(product|phone|laptop|car|service|plan|tool|app|software|buy|purchase|20\d\d)\b/i.test(query)) score += 2;

  // Current affairs (+3) — factual lookups about people/positions change frequently
  if (/\b(who is|who are|who was)\b.*\b(president|ceo|prime minister|leader|founder|owner|chairman|director)\b/i.test(query)) score += 3;
  if (/\b(war|conflict|crisis|earthquake|hurricane|flood)\b/i.test(query) &&
      /\b(current|latest|update|status|now|today)\b/i.test(query)) score += 2;
  if (/\b(ipo|acquisition|merger|layoff|bankruptcy)\b/i.test(query) &&
      /\b(recent|latest|new|announce|just)\b/i.test(query)) score += 2;

  // Weak signals (+1) — not enough alone, but support other signals
  if (/\b(current|new|update|recent)\b/i.test(query)) score += 1;
  if (/\b(price|cost|how much)\b/i.test(query)) score += 1;
  if (/\b(20[2-3]\d)\b/.test(query)) score += 1;

  // Threshold: need score >= 3 to trigger search
  // This means: one strong signal, or two moderate signals, or multiple weak ones
  const shouldSearch = score >= 3;
  if (shouldSearch) {
    logger.info(`Web search triggered (score=${score}) for: "${query.substring(0, 80)}"`);
  }
  return shouldSearch;
}

/**
 * Determine TTL based on query type
 */
function getCacheTTL(query: string): number {
  if (NEWS_PATTERNS.some(p => p.test(query))) return 5 * 60 * 1000;      // 5 min for news
  if (/\b(price|stock|crypto|bitcoin|eth)\b/i.test(query)) return 3 * 60 * 1000; // 3 min for prices
  return 30 * 60 * 1000; // 30 min for general queries
}

// ── Cache Layer ──────────────────────────────────────────────────────

interface CacheEntry {
  response: WebSearchResponse;
  timestamp: number;
  ttl: number;
}

const searchCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 200;

function getCacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getFromCache(query: string): WebSearchResponse | null {
  const key = getCacheKey(query);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    searchCache.delete(key);
    return null;
  }
  return { ...entry.response, source: 'cache' };
}

function saveToCache(query: string, response: WebSearchResponse): void {
  const key = getCacheKey(query);
  const ttl = getCacheTTL(query);

  // Evict oldest if cache full
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }

  searchCache.set(key, { response, timestamp: Date.now(), ttl });
}

// Clean expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of searchCache.entries()) {
    if (now - entry.timestamp > entry.ttl) searchCache.delete(key);
  }
}, 10 * 60 * 1000);

// ── Free Search (Multiple fallback sources) ─────────────────────────

const SEARCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Try multiple free search sources in order:
 * 1. DuckDuckGo Lite (less blocking than full HTML)
 * 2. DuckDuckGo HTML (fallback)
 * 3. If both fail → return empty (Tavily will handle)
 */
async function searchFree(query: string, maxResults = 5, df = ''): Promise<SearchResult[]> {
  // Try DuckDuckGo Lite first (simpler page, less blocking)
  let results = await searchDDGLite(query, maxResults);
  if (results.length >= 2) return results;

  // Fallback: DuckDuckGo full HTML — this one supports the df= time filter
  results = await searchDDGHTML(query, maxResults, df);
  if (results.length >= 2) return results;

  logger.info(`Free search returned ${results.length} results for: "${query}"`);
  return results;
}

async function searchDDGLite(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const response = await axios.post(
      'https://lite.duckduckgo.com/lite/',
      `q=${encodeURIComponent(query)}`,
      {
        headers: {
          ...SEARCH_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://lite.duckduckgo.com/',
        },
        timeout: 8000,
      }
    );

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    // DDG Lite uses table rows for results
    $('table.t a.result-link').each((_i, el) => {
      if (results.length >= maxResults) return;
      const title = $(el).text().trim();
      let url = $(el).attr('href') || '';
      if (url.includes('uddg=')) {
        try { url = decodeURIComponent(new URL(url, 'https://lite.duckduckgo.com').searchParams.get('uddg') || url); } catch {}
      }
      // Get snippet from next sibling td
      const snippet = $(el).closest('tr').next('tr').find('td.result-snippet').text().trim();
      if (title && url && url.startsWith('http') && !url.includes('duckduckgo.com')) {
        results.push({ title, url, content: snippet || title, score: 0 });
      }
    });

    // Alternative parsing — DDG Lite sometimes uses different structure
    if (results.length === 0) {
      const links: Array<{ title: string; url: string }> = [];
      const snippets: string[] = [];

      $('a.result-link').each((_i, el) => {
        const title = $(el).text().trim();
        let url = $(el).attr('href') || '';
        if (url.includes('uddg=')) {
          try { url = decodeURIComponent(new URL(url, 'https://lite.duckduckgo.com').searchParams.get('uddg') || url); } catch {}
        }
        if (title && url.startsWith('http')) links.push({ title, url });
      });

      $('td.result-snippet').each((_i, el) => {
        snippets.push($(el).text().trim());
      });

      for (let i = 0; i < Math.min(links.length, maxResults); i++) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          content: snippets[i] || links[i].title,
          score: 0,
        });
      }
    }

    if (results.length > 0) logger.info(`DDG Lite: ${results.length} results for "${query}"`);
    return results;
  } catch (err: any) {
    logger.debug(`DDG Lite failed: ${err.message}`);
    return [];
  }
}

async function searchDDGHTML(query: string, maxResults = 5, df = ''): Promise<SearchResult[]> {
  try {
    const urlParams = `q=${encodeURIComponent(query)}${df ? `&df=${df}` : ''}`;
    const response = await axios.get(
      `https://html.duckduckgo.com/html/?${urlParams}`,
      { headers: SEARCH_HEADERS, timeout: 8000 }
    );

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('.result').each((_i, el) => {
      if (results.length >= maxResults) return;
      const titleEl = $(el).find('.result__a');
      const snippetEl = $(el).find('.result__snippet');
      const title = titleEl.text().trim();
      const content = snippetEl.text().trim();
      let url = titleEl.attr('href') || '';
      if (url.includes('uddg=')) {
        try { url = decodeURIComponent(new URL(url, 'https://duckduckgo.com').searchParams.get('uddg') || url); } catch {}
      }
      if (title && content && url && url.startsWith('http') && !url.includes('duckduckgo.com')) {
        results.push({ title, url, content, score: 0 });
      }
    });

    if (results.length > 0) logger.info(`DDG HTML: ${results.length} results for "${query}"`);
    return results;
  } catch (err: any) {
    logger.debug(`DDG HTML failed: ${err.message}`);
    return [];
  }
}

// ── Web Crawling (Content Extraction) ────────────────────────────────

interface CrawlResult {
  content: string;
  image?: string;
  siteName?: string;
  snippet?: string;
}

async function crawlUrl(url: string): Promise<CrawlResult> {
  const empty: CrawlResult = { content: '' };
  try {
    // Skip known problematic sites
    if (/\.(pdf|zip|exe|dmg|mp4|mp3|avi)$/i.test(url)) return empty;
    if (/youtube\.com|youtu\.be|twitter\.com|x\.com|instagram\.com|facebook\.com/i.test(url)) return empty;

    const response = await axios.get(url, {
      headers: {
        ...SEARCH_HEADERS,
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 8000,
      maxRedirects: 5,
      validateStatus: (s) => s < 400,
    });

    const $ = cheerio.load(response.data);

    // Extract Open Graph / meta metadata before removing elements
    const rawOgImage = $('meta[property="og:image"]').attr('content')
      || $('meta[property="og:image:url"]').attr('content')
      || $('meta[property="og:image:secure_url"]').attr('content')
      || $('meta[name="twitter:image"]').attr('content')
      || $('meta[name="twitter:image:src"]').attr('content')
      || $('link[rel="image_src"]').attr('href')
      || '';
    const siteName = $('meta[property="og:site_name"]').attr('content')
      || $('meta[name="application-name"]').attr('content')
      || $('title').first().text().split(/[|\-–—]/).pop()?.trim()
      || '';
    const ogDescription = $('meta[property="og:description"]').attr('content')
      || $('meta[name="description"]').attr('content')
      || '';

    // Resolve image URL — handle relative, protocol-relative, and absolute URLs
    let validImage = '';
    if (rawOgImage) {
      try {
        // new URL handles relative, protocol-relative (//), and absolute URLs
        const resolved = new URL(rawOgImage, url).href;
        // Accept any http/https URL, reject data: URIs and tiny tracking pixels
        if (/^https?:\/\//.test(resolved) && !resolved.includes('1x1') && !resolved.includes('pixel')) {
          validImage = resolved;
        }
      } catch { /* invalid URL, skip */ }
    }
    // Fallback: try to find a large hero/article image in the page
    if (!validImage) {
      const heroImg = $('article img[src], .post-content img[src], .article-body img[src], main img[src]').first().attr('src')
        || $('img[width]').filter((_i, el) => parseInt($(el).attr('width') || '0') >= 400).first().attr('src');
      if (heroImg) {
        try {
          const resolved = new URL(heroImg, url).href;
          if (/^https?:\/\//.test(resolved)) validImage = resolved;
        } catch { /* skip */ }
      }
    }

    // Remove noise aggressively
    $('script, style, nav, header, footer, aside, .ad, .ads, .advertisement, .sidebar, .menu, .nav, .cookie, .popup, .modal, .banner, .social, .share, .comments, .comment, .related, .recommended, iframe, noscript, svg, form, .newsletter').remove();

    // Try to find main content — prioritize article content
    let text = '';
    const mainSelectors = [
      'article', 'main', '[role="main"]', '.post-content', '.article-body',
      '.entry-content', '.content', '.post-body', '.story-body', '.article-text',
      '#content', '#main-content', '.main-content', '.page-content',
      '[itemprop="articleBody"]', '.blog-post', '.markdown-body',
    ];
    for (const sel of mainSelectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 300) {
        text = el.text().trim();
        break;
      }
    }

    // Fallback: get all paragraph text
    if (!text || text.length < 300) {
      const paragraphs: string[] = [];
      $('p').each((_i, el) => {
        const t = $(el).text().trim();
        if (t.length > 40) paragraphs.push(t);
      });
      if (paragraphs.join(' ').length > text.length) {
        text = paragraphs.join('\n\n');
      }
    }

    // Last fallback: body text
    if (!text || text.length < 200) {
      text = $('body').text().trim();
    }

    // Clean up
    text = text
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .substring(0, 2000);

    return {
      content: text,
      image: validImage || undefined,
      siteName: siteName || undefined,
      snippet: ogDescription ? ogDescription.substring(0, 200) : undefined,
    };
  } catch {
    return empty;
  }
}

/**
 * Crawl top 5 results in parallel for richer context
 */
async function enrichResults(results: SearchResult[]): Promise<SearchResult[]> {
  const toCrawl = results.slice(0, 5); // Increased from 3 to 5
  const crawlPromises = toCrawl.map(async (r) => {
    const crawled = await crawlUrl(r.url);
    const enriched: SearchResult = { ...r };
    if (crawled.content.length > r.content.length) {
      enriched.content = crawled.content.substring(0, 1500);
    }
    if (crawled.image) {
      enriched.image = crawled.image;
      logger.info(`[WebSearch] OG image found for ${r.url}: ${crawled.image.substring(0, 100)}`);
    } else {
      // Fallback: use screenshot thumbnail service (free, no API key)
      try {
        const domain = new URL(r.url).hostname;
        enriched.image = `https://logo.clearbit.com/${domain}`;
        logger.info(`[WebSearch] No OG image for ${r.url}, using Clearbit logo for ${domain}`);
      } catch { /* skip */ }
    }
    if (crawled.siteName) enriched.siteName = crawled.siteName;
    if (crawled.snippet) enriched.snippet = crawled.snippet;
    return enriched;
  });

  const enriched = await Promise.allSettled(crawlPromises);
  const enrichedResults = enriched
    .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
    .map(r => r.value);

  // Add remaining non-crawled results
  return [...enrichedResults, ...results.slice(5)];
}

// ── Confidence Scoring ───────────────────────────────────────────────

function scoreResults(query: string, results: SearchResult[]): { results: SearchResult[]; confidence: number } {
  if (results.length === 0) return { results: [], confidence: 0 };

  const queryWords = new Set(
    query.toLowerCase().split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for', 'what', 'how', 'is', 'are', 'was', 'were', 'this', 'that', 'with'].includes(w))
  );

  const scored = results.map(r => {
    const text = `${r.title} ${r.content}`.toLowerCase();
    let score = 0;

    // Keyword relevance (0-0.5)
    let matches = 0;
    for (const word of queryWords) {
      if (text.includes(word)) matches++;
    }
    const keywordScore = queryWords.size > 0 ? (matches / queryWords.size) * 0.5 : 0.25;

    // Content richness (0-0.3)
    const contentScore = Math.min(r.content.length / 1000, 1) * 0.3;

    // Has a real URL (0-0.2)
    const urlScore = r.url.startsWith('http') ? 0.2 : 0;

    score = keywordScore + contentScore + urlScore;
    return { ...r, score: Math.round(score * 100) / 100 };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Overall confidence = average of top 3 scores
  const topScores = scored.slice(0, 3).map(r => r.score);
  const avgScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;

  // Adjust confidence based on result count
  let confidence = avgScore;
  if (results.length < 2) confidence *= 0.5;
  if (results.length >= 4) confidence *= 1.1;
  confidence = Math.min(confidence, 1);

  return { results: scored, confidence: Math.round(confidence * 100) / 100 };
}

// ── Perplexity Primary (fresh, cited, first-party search) ───────────

async function searchPerplexity(
  query: string,
  maxResults = 5,
  recency: 'day' | 'week' | 'month' | 'year' | null = null
): Promise<SearchResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return [];

  try {
    const body: Record<string, any> = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a web research tool. Return a concise, factual summary of the latest information relevant to the user query. Prioritize recent developments and cite specific dates when known.',
        },
        { role: 'user', content: query },
      ],
      max_tokens: 1000,
      temperature: 0.2,
      return_citations: true,
    };
    if (recency) body.search_recency_filter = recency;

    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const data = response.data;
    const answer: string = data?.choices?.[0]?.message?.content || '';
    const citations: string[] = Array.isArray(data?.citations) ? data.citations : [];

    if (citations.length === 0 && !answer) return [];

    // If Perplexity returned an answer but no citations, still use the answer as fresh context
    if (citations.length === 0) {
      return [{
        title: 'Perplexity research summary',
        url: 'https://www.perplexity.ai',
        content: answer.slice(0, 2000),
        score: 1,
      }];
    }

    // Turn each citation into a SearchResult stub — crawlUrl() in enrichResults
    // will fetch the real page title + body. Seed the first result with
    // Perplexity's answer so the model still gets fresh context even if a crawl fails.
    return citations.slice(0, maxResults).map((url, i) => ({
      title: url,
      url,
      content: i === 0 ? answer.slice(0, 1500) : '',
      score: 1 - (i * 0.1),
    }));
  } catch (err: any) {
    logger.error(`Perplexity search failed: ${err?.response?.status || ''} ${err.message}`);
    return [];
  }
}

// ── Tavily Fallback ──────────────────────────────────────────────────

async function searchTavily(query: string, maxResults = 5): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const timeSensitive = isTimeSensitive(query);

  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      include_raw_content: false,
      search_depth: 'advanced',
      ...(timeSensitive ? { topic: 'news', days: 7 } : {}),
    }, { timeout: 15000 });

    return (response.data.results || []).map((r: any, i: number) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: 1 - (i * 0.1), // Tavily results are pre-ranked
    }));
  } catch (err: any) {
    logger.error(`Tavily search failed: ${err.message}`);
    return [];
  }
}

// ── Build Context Text ───────────────────────────────────────────────

function buildContextText(query: string, results: SearchResult[], source: string): string {
  if (results.length === 0) return '';

  const today = new Date().toISOString().split('T')[0];
  let ctx = `[WEB SEARCH RESULTS for: "${query}" — via ${source}, searched on ${today}]\n\n`;

  // Use ~5000 chars across 5 sources for richer, more detailed AI responses
  const sourceCount = Math.min(results.length, 5);
  const maxPerSource = Math.floor(5000 / sourceCount);

  results.slice(0, sourceCount).forEach((r, i) => {
    ctx += `━━━ SOURCE ${i + 1} ━━━\n`;
    ctx += `Title: ${r.title}\n`;
    ctx += `URL: ${r.url}\n`;
    if (r.siteName) ctx += `Publisher: ${r.siteName}\n`;
    const content = r.content.substring(0, maxPerSource).trim();
    ctx += `Content:\n${content}\n\n`;
  });

  ctx += `[Use ALL sources above to write a comprehensive, well-structured answer. Cross-reference data between sources for accuracy.]\n`;

  return ctx;
}

// ── Main Search Function ─────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.5; // Higher threshold = Tavily kicks in more often = better results

/**
 * Perform web search with freshness-first priority:
 * 1. Check cache
 * 2. Try Perplexity sonar (fresh, cited, handles recency natively)
 * 3. Fallback: DuckDuckGo with df= time filter
 * 4. Fallback: Tavily (paid)
 * 5. Cache results
 *
 * Perplexity is primary because it reliably returns fresh news with citations.
 * DDG/Tavily only fire if Perplexity is unavailable or returns nothing useful.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResponse> {
  // 1. Check cache
  const cached = getFromCache(query);
  if (cached) {
    logger.info(`Web search cache hit: "${query}"`);
    return cached;
  }

  const timeSensitive = isTimeSensitive(query);
  const recency = getRecencyFilter(query);
  let source: 'perplexity' | 'duckduckgo' | 'tavily' = 'duckduckgo';
  let results: SearchResult[] = [];

  // 2. Perplexity primary — fresh, cited, handles recency natively
  const perplexityResults = await searchPerplexity(query, maxResults, recency.perplexity);
  if (perplexityResults.length > 0) {
    results = await enrichResults(perplexityResults);
    source = 'perplexity';
    logger.info(`Perplexity returned ${perplexityResults.length} citations for: "${query}" (recency=${recency.perplexity || 'any'})`);
  }

  // 3. DDG fallback — only if Perplexity failed or is not configured
  if (results.length < 2) {
    const year = new Date().getFullYear();
    const ddgQuery = timeSensitive && !query.includes(String(year)) ? `${query} ${year}` : query;
    const ddgResults = await searchFree(ddgQuery, maxResults, recency.ddg);
    if (ddgResults.length > 0) {
      results = await enrichResults(ddgResults);
      source = 'duckduckgo';
    }
  }

  // 4. Score whatever we have
  let { results: scored, confidence } = scoreResults(query, results);

  // 5. Tavily last-resort — only if we still have nothing good
  if (confidence < CONFIDENCE_THRESHOLD || scored.length < 2) {
    logger.info(`Low confidence (${confidence}), falling back to Tavily for: "${query}"`);
    const tavilyResults = await searchTavily(query, maxResults);
    if (tavilyResults.length > 0) {
      const enrichedTavily = await enrichResults(tavilyResults);
      const tavilyScored = scoreResults(query, enrichedTavily);
      if (tavilyScored.confidence > confidence) {
        scored = tavilyScored.results;
        confidence = tavilyScored.confidence;
        source = 'tavily';
      }
    }
  }

  const contextText = buildContextText(query, scored, source);
  const response: WebSearchResponse = {
    searched: scored.length > 0,
    query,
    source,
    confidence,
    results: scored,
    contextText,
  };

  if (scored.length > 0) {
    saveToCache(query, response);
  }

  logger.info(`Web search completed: "${query}" → ${scored.length} results via ${source} (confidence: ${confidence})`);
  return response;
}
