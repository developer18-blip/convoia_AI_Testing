/**
 * URL Fetch Service — detects URLs in messages, fetches pages,
 * extracts readable text, and enriches the message with content.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import logger from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────────────

interface FetchedURL {
  url: string;
  title: string;
  content: string;
  contentLength: number;
  fetchedAt: Date;
  success: boolean;
  error?: string;
}

interface FetchResult {
  urls: FetchedURL[];
  enrichedMessage: string;
}

// ── Limits ────────────────────────────────────────────────────────────

const MAX_URLS_PER_MESSAGE = 3;
const FETCH_TIMEOUT_MS = 10000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;   // 5MB
const MAX_CONTENT_LENGTH = 15000;              // chars per URL
const MAX_TOTAL_CONTENT = 30000;               // chars across all URLs

// ── SSRF Protection ───────────────────────────────────────────────────

const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
];

const BLOCKED_IP_PREFIXES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.',
  '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '169.254.',
  'fc00:', 'fd00:', 'fe80:',
];

const MEDIA_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dmg', '.msi', '.deb',
]);

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/json',
  'text/markdown',
  'application/xml',
  'text/xml',
];

function isBlockedURL(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;

    const hostname = parsed.hostname.toLowerCase();

    // Direct domain match
    if (BLOCKED_DOMAINS.includes(hostname)) return true;

    // IP prefix check
    for (const prefix of BLOCKED_IP_PREFIXES) {
      if (hostname.startsWith(prefix)) return true;
    }

    return false;
  } catch {
    return true; // Malformed URL
  }
}

function isMediaURL(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return MEDIA_EXTENSIONS.has(pathname.slice(pathname.lastIndexOf('.')));
  } catch {
    return false;
  }
}

// ── In-memory Cache (5-minute TTL) ────────────────────────────────────

const urlCache = new Map<string, { data: FetchedURL; expiresAt: number }>();

function getCached(url: string): FetchedURL | null {
  const entry = urlCache.get(url);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  if (entry) urlCache.delete(url);
  return null;
}

function setCache(url: string, data: FetchedURL): void {
  urlCache.set(url, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
  // Limit cache size
  if (urlCache.size > 100) {
    const oldest = urlCache.keys().next().value;
    if (oldest) urlCache.delete(oldest);
  }
}

// ── URL Detection ─────────────────────────────────────────────────────

function extractURLs(text: string): string[] {
  // Remove URLs inside code blocks
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');

  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]()]+/gi;
  const matches = withoutCodeBlocks.match(urlRegex) || [];

  // Deduplicate, skip media, limit to MAX_URLS_PER_MESSAGE
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const match of matches) {
    // Clean trailing punctuation
    const cleaned = match.replace(/[.,;:!?)]+$/, '');
    if (seen.has(cleaned)) continue;
    if (isMediaURL(cleaned)) continue;
    if (isBlockedURL(cleaned)) continue;
    seen.add(cleaned);
    urls.push(cleaned);
    if (urls.length >= MAX_URLS_PER_MESSAGE) break;
  }

  return urls;
}

// ── Fetch Single URL ──────────────────────────────────────────────────

async function fetchURL(url: string): Promise<FetchedURL> {
  const base = { url, fetchedAt: new Date() };

  // Check cache first
  const cached = getCached(url);
  if (cached) return cached;

  try {
    // Check if it's a PDF
    if (url.toLowerCase().endsWith('.pdf')) {
      return { ...base, title: '', content: '', contentLength: 0, success: false, error: 'PDF detected — please upload the file instead' };
    }

    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_SIZE,
      headers: {
        'User-Agent': 'ConvoiaAI/1.0 (URL Preview Bot)',
        'Accept': 'text/html,text/plain,application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      responseType: 'text',
      maxRedirects: 3,
      validateStatus: (status) => status < 400,
    });

    // Validate content type
    const contentType = (response.headers['content-type'] || '').toLowerCase();
    const isAllowed = ALLOWED_CONTENT_TYPES.some(t => contentType.includes(t));
    if (!isAllowed) {
      return { ...base, title: '', content: '', contentLength: 0, success: false, error: `Not a webpage (${contentType.split(';')[0]})` };
    }

    const html = String(response.data);

    // JSON response — format directly
    if (contentType.includes('application/json')) {
      try {
        const pretty = JSON.stringify(JSON.parse(html), null, 2);
        const truncated = pretty.length > MAX_CONTENT_LENGTH
          ? pretty.slice(0, MAX_CONTENT_LENGTH) + '\n[content truncated]'
          : pretty;
        const result: FetchedURL = { ...base, title: url, content: truncated, contentLength: pretty.length, success: true };
        setCache(url, result);
        return result;
      } catch { /* fall through to HTML parsing */ }
    }

    // Plain text — return directly
    if (contentType.includes('text/plain') || contentType.includes('text/markdown')) {
      const truncated = html.length > MAX_CONTENT_LENGTH
        ? html.slice(0, MAX_CONTENT_LENGTH) + '\n[content truncated]'
        : html;
      const result: FetchedURL = { ...base, title: url, content: truncated, contentLength: html.length, success: true };
      setCache(url, result);
      return result;
    }

    // HTML — extract readable content
    const extracted = extractReadableContent(html, url);

    if (extracted.content.length < 100) {
      const result: FetchedURL = { ...base, title: extracted.title, content: extracted.content, contentLength: extracted.content.length, success: true, error: extracted.content.length < 50 ? '[Minimal content extracted — page may be paywalled or require JavaScript]' : undefined };
      setCache(url, result);
      return result;
    }

    const result: FetchedURL = { ...base, ...extracted, contentLength: extracted.content.length, success: true };
    setCache(url, result);
    return result;
  } catch (err: any) {
    const status = err?.response?.status;
    let error = err.message;
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') error = 'Timeout after 10s';
    else if (status === 401 || status === 403) error = 'Access denied';
    else if (status === 404) error = 'Page not found';
    else if (status === 429) error = 'Rate limited by target site';

    return { ...base, title: '', content: '', contentLength: 0, success: false, error };
  }
}

// ── HTML Content Extraction ───────────────────────────────────────────

function extractReadableContent(html: string, _url: string): { title: string; content: string } {
  const $ = cheerio.load(html);

  // Extract title
  const title = $('title').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    '';

  // Remove non-content elements (targeted — avoid over-removing)
  $('script, style, nav, footer, iframe, noscript, svg, form, aside').remove();
  $('[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]').remove();
  $('[class*="cookie"], [class*="popup"], [class*="modal"], [class*="ad-wrapper"], [class*="advertisement"]').remove();
  $('[id*="cookie"], [id*="popup"], [id*="modal"]').remove();

  // Find main content — try priority selectors
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content, .article-content, .entry-content, .content, .post-body, .article-body',
    '#content, #main-content, #mw-content-text',
    'body',
  ];

  let text = '';
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length > 0) {
      const extracted = el.text();
      if (extracted.length > 200) {
        text = extracted;
        break;
      }
    }
  }

  // Final fallback
  if (text.length < 200) {
    text = $('body').text();
  }

  // Clean up whitespace
  text = text
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();

  // Truncate
  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.slice(0, MAX_CONTENT_LENGTH) + '\n[content truncated]';
  }

  return { title, content: text };
}

// ── Build Enriched Message ────────────────────────────────────────────

function buildEnrichedMessage(originalMessage: string, fetchedURLs: FetchedURL[]): string {
  const urlSections: string[] = [];
  let totalChars = 0;

  for (const fetched of fetchedURLs) {
    if (fetched.success && fetched.content) {
      // Respect total content limit
      let content = fetched.content;
      if (totalChars + content.length > MAX_TOTAL_CONTENT) {
        content = content.slice(0, MAX_TOTAL_CONTENT - totalChars) + '\n[content truncated due to total limit]';
      }
      totalChars += content.length;

      urlSections.push(
        `<url_content source="${fetched.url}">\n` +
        (fetched.title ? `Title: ${fetched.title}\n` : '') +
        `${content}\n` +
        `</url_content>`
      );
    } else {
      urlSections.push(`[Could not fetch ${fetched.url}: ${fetched.error || 'Unknown error'}]`);
    }
  }

  if (urlSections.length === 0) return originalMessage;

  return urlSections.join('\n\n') + '\n\n' + originalMessage;
}

// ── Main Export ───────────────────────────────────────────────────────

export async function fetchAndExtractURLs(text: string): Promise<FetchResult> {
  const urls = extractURLs(text);

  if (urls.length === 0) {
    return { urls: [], enrichedMessage: text };
  }

  logger.info(`URL fetch: detected ${urls.length} URL(s): ${urls.join(', ')}`);

  // Fetch all URLs in parallel
  const fetchedURLs = await Promise.all(urls.map(url => fetchURL(url)));

  const successCount = fetchedURLs.filter(u => u.success).length;
  logger.info(`URL fetch: ${successCount}/${fetchedURLs.length} fetched successfully`);

  const enrichedMessage = buildEnrichedMessage(text, fetchedURLs);

  return { urls: fetchedURLs, enrichedMessage };
}
