// Historical estimate: which users LIKELY triggered Perplexity calls.
//
// The aiController decides to call Perplexity when `needsWebSearch(prompt)`
// returns true. That function is replicated verbatim below so we can replay
// it against every existing UsageLog row and attribute likely Perplexity
// invocations to the correct user.
//
// Result is an ESTIMATE, not ground truth, because:
//   - Prompts are truncated at 500 chars in UsageLog (the heuristic sees
//     the same truncated text the future classifier will, so it still
//     agrees with itself, but very long queries may have extra signals
//     that aren't in the stored prompt).
//   - The Perplexity API might have been unavailable for some calls,
//     causing the system to fall back to DuckDuckGo / Tavily instead.
//   - We can't tell from the prompt alone whether hasDocumentContext
//     was true at request time — we assume false (conservative; flags
//     more rows, not fewer).
//
// Usage: node scripts/perplexity-historical.mjs

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── needsWebSearch() — verbatim from webSearchService.ts ─────────────
function needsWebSearch(query, hasDocumentContext = false) {
  if (query.length < 15) return false;
  if (hasDocumentContext) return false;

  const SKIP_PATTERNS = [
    /\b(this document|this pdf|this file|the file|the document|attached|uploaded|the text above)\b/i,
    /\b(analyze this|summarize this|explain this|read this|review this)\b/i,
    /^here is the attached document/i,
    /^(write|create|draft|compose|generate|make)\b/i,
    /\b(poem|story|essay|email|letter|script|song|blog post|article)\b.*\b(about|for|on)\b/i,
    /\b(code|function|class|variable|bug|error|syntax|debug|fix|refactor|optimize|implement)\b/i,
    /\b(python|javascript|typescript|java|rust|go|html|css|sql|react|node)\b/i,
    /^(translate|convert|rewrite|paraphrase|simplify|rephrase)\b/i,
    /^(explain|teach me|what is|what are|how does|how do|why does|why do|define)\b.*\b(work|mean|function|concept|theory|algorithm|principle)\b/i,
    /^(hello|hi|hey|good morning|good evening|how are you|thank you|thanks|ok|okay|sure|yes|no|bye)\b/i,
    /^(calculate|solve|compute|what is \d)/i,
    /\b(you said|you mentioned|earlier|above|previous|last message|in our conversation)\b/i,
  ];
  if (SKIP_PATTERNS.some((p) => p.test(query))) return false;

  if (/\bsearch\s+(the\s+)?(web|internet|online|for)\b/i.test(query)) return true;
  if (/\b(look up|google|search for|find me|browse)\b/i.test(query)) return true;

  let score = 0;
  if (/\b(today|right now|currently|at the moment|as of now)\b/i.test(query)) score += 3;
  if (/\b(breaking|happening now|live|real.?time)\b/i.test(query)) score += 3;
  if (/\b(news|headline|trending|viral)\b/i.test(query)) score += 3;
  if (/\b(latest|newest|recent|this week|this month|this year)\b/i.test(query)) score += 2;
  if (/\b(20(2[5-9]|[3-9]\d))\b/.test(query)) score += 2;
  if (/\b(price|stock|market|crypto|bitcoin|ethereum|nasdaq)\b/i.test(query) &&
      /\b(current|now|today|live|latest|what is)\b/i.test(query)) score += 3;
  if (/\b(weather|forecast|temperature)\b/i.test(query) &&
      /\b(today|tomorrow|this week|in|at)\b/i.test(query)) score += 3;
  if (/\b(score|match|game|result)\b/i.test(query) &&
      /\b(today|last night|yesterday|live|final)\b/i.test(query)) score += 3;
  if (/\b(election|vote|poll)\b/i.test(query) &&
      /\b(result|winner|latest|current|update)\b/i.test(query)) score += 3;
  if (/\b(compare|vs|versus|comparison|which is better)\b/i.test(query) &&
      /\b(product|phone|laptop|car|service|plan|tool|app|software|camera|tablet|watch|tv)\b/i.test(query)) score += 2;
  if (/\b(best|top \d+|review|recommend)\b/i.test(query) &&
      /\b(product|phone|laptop|car|service|plan|tool|app|software|buy|purchase|20\d\d)\b/i.test(query)) score += 2;
  if (/\b(who is|who are|who was)\b.*\b(president|ceo|prime minister|leader|founder|owner|chairman|director)\b/i.test(query)) score += 3;
  if (/\b(war|conflict|crisis|earthquake|hurricane|flood)\b/i.test(query) &&
      /\b(current|latest|update|status|now|today)\b/i.test(query)) score += 2;
  if (/\b(ipo|acquisition|merger|layoff|bankruptcy)\b/i.test(query) &&
      /\b(recent|latest|new|announce|just)\b/i.test(query)) score += 2;

  if (/\b(when|where)\b/i.test(query)) score += 1;
  if (/\b(statistics|stats|data|numbers|figures|rate|percentage)\b/i.test(query)) score += 1;
  if (/\b(event|conference|release|launch|announcement)\b/i.test(query)) score += 1;

  return score >= 3;
}

// ── Pull every UsageLog row with user + model info ───────────────────
const rows = await prisma.usageLog.findMany({
  select: {
    id: true,
    userId: true,
    prompt: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
    createdAt: true,
    user: { select: { email: true, name: true, organization: { select: { name: true, tier: true } } } },
    model: { select: { name: true, provider: true } },
  },
  orderBy: { createdAt: 'desc' },
});

const userAgg = new Map();
let flagged = 0;

for (const row of rows) {
  const likely = needsWebSearch(row.prompt || '', false);
  if (!likely) continue;
  flagged++;

  const key = row.userId;
  if (!userAgg.has(key)) {
    userAgg.set(key, {
      user: row.user,
      queries: 0,
      rows: [],
    });
  }
  const u = userAgg.get(key);
  u.queries++;
  u.rows.push(row);
}

// ── Output ───────────────────────────────────────────────────────────
const line = '═'.repeat(78);
const dash = '─'.repeat(78);
const dtStr = (d) => new Date(d).toISOString().replace('T', ' ').substring(0, 19);

console.log('');
console.log(line);
console.log('  PERPLEXITY HISTORICAL ESTIMATE  (replaying needsWebSearch heuristic)');
console.log(`  Generated: ${new Date().toISOString()}`);
console.log(line);
console.log('');
console.log(`  Total UsageLog rows scanned:          ${rows.length}`);
console.log(`  Rows flagged as likely web search:    ${flagged}`);
console.log(`  Distinct users with likely searches:  ${userAgg.size}`);
console.log('');

if (userAgg.size === 0) {
  console.log('  No rows matched the needsWebSearch heuristic.');
  console.log('  Either no one asked time-sensitive questions yet, or their');
  console.log('  prompts were below the 15-char minimum / hit a SKIP_PATTERN.');
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}

// Sort users by flagged count desc
const sortedUsers = [...userAgg.entries()].sort((a, b) => b[1].queries - a[1].queries);

console.log('  BY USER  (sorted by likely Perplexity calls)');
console.log(dash);
for (const [userId, info] of sortedUsers) {
  const u = info.user;
  const who = u ? `${u.email}${u.name ? ` (${u.name})` : ''}` : `<deleted ${userId}>`;
  const org = u?.organization ? ` · ${u.organization.name} [${u.organization.tier}]` : '';
  console.log(`  ${who}${org}`);
  console.log(`    ${info.queries} likely Perplexity call(s)`);
  // Show up to 5 example prompts
  const examples = info.rows.slice(0, 5);
  for (const r of examples) {
    const promptPreview = (r.prompt || '').substring(0, 80).replace(/\s+/g, ' ');
    console.log(`      [${dtStr(r.createdAt)}]  ${promptPreview}${(r.prompt || '').length > 80 ? '…' : ''}`);
  }
  if (info.rows.length > 5) {
    console.log(`      (+${info.rows.length - 5} more)`);
  }
  console.log('');
}
console.log(line);
console.log('');
console.log('  NOTE: This is an ESTIMATE. Going forward, the new webSearchUsed +');
console.log('  webSearchSource columns on UsageLog will give ground-truth data.');
console.log('');

await prisma.$disconnect();
