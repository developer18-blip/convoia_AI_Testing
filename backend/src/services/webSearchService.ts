import axios from 'axios';
import logger from '../config/logger.js';

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface WebSearchResponse {
  searched: boolean;
  query: string;
  results: SearchResult[];
  contextText: string;
}

// Patterns that indicate the user wants real-time / live data
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
];

/**
 * Check if a query needs web search (real-time data)
 */
export function needsWebSearch(query: string): boolean {
  return REALTIME_PATTERNS.some(pattern => pattern.test(query));
}

/**
 * Perform web search via Tavily API
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    logger.warn('TAVILY_API_KEY not set — web search disabled');
    return { searched: false, query, results: [], contextText: '' };
  }

  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      search_depth: 'basic',
    }, { timeout: 10000 });

    const results: SearchResult[] = (response.data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
    }));

    // Build context text for the AI
    const answer = response.data.answer || '';
    let contextText = `[Web Search Results for: "${query}"]\n\n`;

    if (answer) {
      contextText += `Quick Answer: ${answer}\n\n`;
    }

    contextText += `Sources:\n`;
    results.forEach((r, i) => {
      contextText += `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.substring(0, 300)}\n\n`;
    });

    logger.info(`Web search completed: "${query}" → ${results.length} results`);

    return { searched: true, query, results, contextText };
  } catch (error: any) {
    logger.error(`Web search failed: ${error.message}`);
    return { searched: false, query, results: [], contextText: '' };
  }
}
