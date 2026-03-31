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
  source: 'cache' | 'duckduckgo' | 'tavily' | 'none';
  confidence: number;
  results: SearchResult[];
  contextText: string;
}

// ── Query Classification ─────────────────────────────────────────────

const REALTIME_PATTERNS = [
  // Time-sensitive queries
  /\b(current|latest|today|now|right now|live|real.?time|recent|this week|this month|this year)\b/i,
  /\b(news|headline|update|happening|breaking|trending|viral)\b/i,
  /\b(weather|temperature|forecast)\b/i,
  // Prices, stocks, crypto
  /\b(price|cost|worth|valuation|market cap)\b.*\b(of|for)\b/i,
  /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|doge|crypto|stock|share|nasdaq|dow|s&p|gold|silver|oil)\b/i,
  /\b(exchange rate|conversion|convert)\b/i,
  // Sports, events
  /\b(score|result|match|game|tournament|championship|winner|won)\b.*\b(today|yesterday|last|live|final)\b/i,
  /\b(election|poll|vote|voting)\b/i,
  // Product/tech lookups
  /\b(latest|newest|recent|new|upcoming)\b.*\b(version|release|update|model|phone|laptop|car|feature)\b/i,
  /\b(compare|comparison|vs|versus|best|top \d+|review)\b/i,
  // Explicit search requests
  /\bsearch\s+(the\s+)?(web|internet|online|for)\b/i,
  /\b(look up|find out|check|google|search for|find me)\b/i,
  // Facts that may have changed
  /\b(who is|who are|who was)\b.*\b(president|ceo|prime minister|leader|head|founder|owner)\b/i,
  /\b(how many|how much|what is the population|gdp|revenue)\b/i,
  // Years (anything mentioning recent/future years)
  /\b(20[2-3]\d)\b/i,
  // Locations, companies, people (proper nouns that may need current info)
  /\b(war|conflict|crisis|disaster|earthquake|flood|hurricane)\b/i,
  /\b(ipo|acquisition|merger|layoff|launch|announce)\b/i,
];

const NEWS_PATTERNS = [
  /\b(news|headline|breaking|update|happening|latest|trending)\b/i,
  /\b(today|this morning|tonight|this week|this month)\b/i,
];

// Queries that should NOT trigger search (purely knowledge/creative tasks)
const NO_SEARCH_PATTERNS = [
  /^(write|create|draft|compose|generate)\b.*\b(poem|story|essay|code|email|letter|script|song)\b/i,
  /^(explain|teach me|how does|what does)\b.*\b(work|mean|function)\b/i,
  /^(translate|convert)\b.*\b(to|into)\b.*\b(english|spanish|french|hindi|german|chinese|japanese)\b/i,
  /^(help me|can you|please)\b.*\b(write|code|debug|fix|refactor|optimize)\b/i,
  /^(summarize|rewrite|paraphrase|simplify)\b/i,
  /\b(hello|hi|hey|good morning|good evening|how are you|thank you|thanks)\b/i,
];

/**
 * Smart detection: should this query use web search?
 */
export function needsWebSearch(query: string): boolean {
  // Skip very short queries or greetings
  if (query.length < 10) return false;
  // Skip creative/knowledge tasks that don't need fresh data
  if (NO_SEARCH_PATTERNS.some(p => p.test(query))) return false;
  // Trigger on any realtime pattern
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
async function searchFree(query: string, maxResults = 5): Promise<SearchResult[]> {
  // Try DuckDuckGo Lite first (simpler page, less blocking)
  let results = await searchDDGLite(query, maxResults);
  if (results.length >= 2) return results;

  // Fallback: DuckDuckGo full HTML
  results = await searchDDGHTML(query, maxResults);
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

async function searchDDGHTML(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const response = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
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
      include_raw_content: false,
      search_depth: 'advanced',
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

  // 2. Try free search (DuckDuckGo Lite → DuckDuckGo HTML)
  let results = await searchFree(query, maxResults);
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
      // Enrich Tavily results with OG metadata from crawling
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

  // 5. Cache results
  if (scored.length > 0) {
    saveToCache(query, response);
  }

  logger.info(`Web search completed: "${query}" → ${scored.length} results via ${source} (confidence: ${confidence})`);
  return response;
}
