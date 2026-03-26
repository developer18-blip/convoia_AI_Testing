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
}

export interface WebSearchResponse {
  searched: boolean;
  query: string;
  source: 'cache' | 'duckduckgo' | 'tavily' | 'none';
  confidence: number;
  results: SearchResult[];
  contextText: string;
}

// ── Query Classification ─────────────────────────────────────────────

const REALTIME_PATTERNS = [
  /\b(price|cost|worth)\b.*\b(of|for)\b.*\b(bitcoin|btc|ethereum|eth|crypto|stock|share|gold|silver|oil)\b/i,
  /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|doge)\b.*\b(price|value|worth)\b/i,
  /\b(current|latest|today|now|right now|live|real.?time)\b.*\b(price|news|weather|score|result|rate|exchange)\b/i,
  /\b(what is|what's|how much|tell me)\b.*\b(today|now|current|latest|right now)\b/i,
  /\b(news|headline|update|happening)\b.*\b(today|now|latest|recent|this week)\b/i,
  /\b(weather|temperature|forecast)\b.*\b(in|at|for|today|now)\b/i,
  /\b(score|result|match|game)\b.*\b(today|yesterday|last night|live)\b/i,
  /\b(stock|share|market|nasdaq|dow|s&p)\b.*\b(price|today|now|current)\b/i,
  /\b(exchange rate|conversion|convert)\b.*\b(usd|eur|gbp|inr|jpy)\b/i,
  /\b(who won|who is winning|election|poll)\b/i,
  /\b(latest|newest|recent|new)\b.*\b(version|release|update|model|iphone|android)\b/i,
  /\bsearch\s+(the\s+)?(web|internet|online)\b/i,
  /\b(look up|find out|check)\b.*\b(online|web)\b/i,
  /\b(20[2-3]\d)\b/i, // Any year 2020-2039
];

const NEWS_PATTERNS = [
  /\b(news|headline|breaking|update|happening|latest)\b/i,
  /\b(today|this morning|tonight|this week)\b/i,
];

/**
 * Check if a query needs web search
 */
export function needsWebSearch(query: string): boolean {
  return REALTIME_PATTERNS.some(pattern => pattern.test(query));
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

// ── DuckDuckGo Search (FREE) ────────────────────────────────────────

const DDG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function searchDuckDuckGo(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    // Use DuckDuckGo HTML search
    const encodedQuery = encodeURIComponent(query);
    const response = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
      { headers: DDG_HEADERS, timeout: 8000 }
    );

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    // Parse DuckDuckGo results
    $('.result').each((_i, el) => {
      if (results.length >= maxResults) return;

      const titleEl = $(el).find('.result__a');
      const snippetEl = $(el).find('.result__snippet');
      const urlEl = $(el).find('.result__url');

      const title = titleEl.text().trim();
      const content = snippetEl.text().trim();
      let url = urlEl.attr('href') || titleEl.attr('href') || '';

      // DuckDuckGo wraps URLs in redirects
      if (url.includes('uddg=')) {
        try {
          const parsed = new URL(url, 'https://duckduckgo.com');
          url = decodeURIComponent(parsed.searchParams.get('uddg') || url);
        } catch { /* keep original */ }
      }

      if (title && content && url && !url.includes('duckduckgo.com')) {
        results.push({ title, url, content, score: 0 });
      }
    });

    return results;
  } catch (err: any) {
    logger.warn(`DuckDuckGo search failed: ${err.message}`);
    return [];
  }
}

// ── Web Crawling (Content Extraction) ────────────────────────────────

async function crawlUrl(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: DDG_HEADERS,
      timeout: 6000,
      maxRedirects: 3,
      validateStatus: (s) => s < 400,
    });

    const $ = cheerio.load(response.data);

    // Remove noise
    $('script, style, nav, header, footer, .ad, .sidebar, .menu, .nav, .cookie, .popup, iframe, noscript').remove();

    // Try to find main content
    let text = '';
    const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content', '.content'];
    for (const sel of mainSelectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 200) {
        text = el.text().trim();
        break;
      }
    }

    // Fallback to body
    if (!text || text.length < 200) {
      text = $('body').text().trim();
    }

    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .substring(0, 2000); // Cap at 2000 chars

    return text;
  } catch {
    return '';
  }
}

/**
 * Crawl top results in parallel (max 3 to be fast)
 */
async function enrichResults(results: SearchResult[]): Promise<SearchResult[]> {
  const toCrawl = results.slice(0, 3);
  const crawlPromises = toCrawl.map(async (r) => {
    const content = await crawlUrl(r.url);
    if (content.length > r.content.length) {
      return { ...r, content: content.substring(0, 1500) };
    }
    return r;
  });

  const enriched = await Promise.allSettled(crawlPromises);
  const enrichedResults = enriched
    .filter((r): r is PromiseFulfilledResult<SearchResult> => r.status === 'fulfilled')
    .map(r => r.value);

  // Add remaining non-crawled results
  return [...enrichedResults, ...results.slice(3)];
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

// ── Tavily Fallback ──────────────────────────────────────────────────

async function searchTavily(query: string, maxResults = 5): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      search_depth: 'basic',
    }, { timeout: 10000 });

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

  let ctx = `[Web Search Results for: "${query}" (via ${source})]\n\n`;
  results.slice(0, 5).forEach((r, i) => {
    ctx += `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.substring(0, 400)}\n\n`;
  });
  ctx += `[Use these sources to provide accurate, up-to-date information. Cite sources when relevant.]\n`;

  return ctx;
}

// ── Main Search Function ─────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.4;

/**
 * Perform hybrid web search:
 * 1. Check cache
 * 2. Try DuckDuckGo (free)
 * 3. If low confidence → fallback to Tavily
 * 4. Cache results
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResponse> {
  // 1. Check cache
  const cached = getFromCache(query);
  if (cached) {
    logger.info(`Web search cache hit: "${query}"`);
    return cached;
  }

  // 2. Try DuckDuckGo (FREE)
  let results = await searchDuckDuckGo(query, maxResults);
  let source: 'duckduckgo' | 'tavily' = 'duckduckgo';

  // Enrich top results with crawled content (parallel, fast)
  if (results.length > 0) {
    results = await enrichResults(results);
  }

  // 3. Score results
  let { results: scored, confidence } = scoreResults(query, results);

  // 4. Fallback to Tavily if confidence too low
  if (confidence < CONFIDENCE_THRESHOLD || scored.length < 2) {
    logger.info(`DuckDuckGo low confidence (${confidence}), falling back to Tavily for: "${query}"`);
    const tavilyResults = await searchTavily(query, maxResults);
    if (tavilyResults.length > 0) {
      const tavilyScored = scoreResults(query, tavilyResults);
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

  // 5. Cache results
  if (scored.length > 0) {
    saveToCache(query, response);
  }

  logger.info(`Web search completed: "${query}" → ${scored.length} results via ${source} (confidence: ${confidence})`);
  return response;
}
