#!/usr/bin/env node
/**
 * Apex/Council Test Suite Runner
 *
 * Runs the 15-query suite (queries.json) against the deployed Council Mode
 * endpoint and captures structured artifacts per query.
 *
 * Usage:
 *   set CONVOIA_API_KEY=cvai_xxx                  (Windows cmd)
 *   $env:CONVOIA_API_KEY="cvai_xxx"               (PowerShell)
 *   export CONVOIA_API_KEY=cvai_xxx               (bash)
 *
 *   node scripts/apex-test-suite/run-suite.js --baseline
 *   node scripts/apex-test-suite/run-suite.js --day1
 *   node scripts/apex-test-suite/run-suite.js --day1 --base http://localhost:5050/api
 *
 * Modes:
 *   --baseline   5-model council against current prod (claude-sonnet-4-6,
 *                gpt-5.4, gemini-3.1-pro-preview, claude-opus-4-6, o3)
 *   --day1       3-model council (claude-opus-4-7, gpt-5.5, gemini-2.5-pro)
 *
 * Optional flags:
 *   --base <url>  Override API base. Default: https://convoia.ai/api
 *   --only <id>   Run a single query (e.g. --only B1). Useful for iteration.
 *   --skip <ids>  Comma-separated query IDs to skip (e.g. --skip A1,A2)
 *
 * Output:
 *   scripts/apex-test-suite/<mode>-<timestamp>/
 *     <id>.json   Full structured capture per query
 *     <id>.md     Verdict-only, human-readable
 *     _index.md   Suite-level summary with category breakdown
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ── 1. Auth gate ──────────────────────────────────────────────────────────
const API_KEY = process.env.CONVOIA_API_KEY;
if (!API_KEY || !API_KEY.trim()) {
  console.error('FATAL: CONVOIA_API_KEY env var is required.');
  process.exit(1);
}

// ── 2. Args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name) { return argv.includes(name); }
function flagValue(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

const IS_BASELINE = flag('--baseline');
const IS_DAY1 = flag('--day1');
if (!IS_BASELINE && !IS_DAY1) {
  console.error('FATAL: must pass --baseline or --day1');
  process.exit(1);
}
const MODE = IS_BASELINE ? 'baseline' : 'day1';
const API_BASE = (flagValue('--base') || 'https://convoia.ai/api').replace(/\/$/, '');
const ONLY = flagValue('--only');
const SKIP = (flagValue('--skip') || '').split(',').map(s => s.trim()).filter(Boolean);

// ── 3. Mode-specific model selection ──────────────────────────────────────
// Baseline = current prod's 5-model recommended set
// Day 1 = new 3-model contract
const MODEL_IDS_BY_MODE = {
  baseline: [
    'claude-sonnet-4-6',
    'gpt-5.4',
    'gemini-3.1-pro-preview',
    'claude-opus-4-6',
    'o3',
  ],
  day1: [
    'claude-opus-4-7',
    'gpt-5.5',
    'gemini-2.5-pro',
  ],
};

// ── 4. IO helpers ─────────────────────────────────────────────────────────
const QUERIES_PATH = path.join(__dirname, 'queries.json');
const queries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf-8'));

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(__dirname, `${MODE}-${TIMESTAMP}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`[apex-suite] mode=${MODE} base=${API_BASE} out=${OUT_DIR}`);

// ── 5. HTTP / SSE ─────────────────────────────────────────────────────────
function postJSON(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body));
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${API_KEY}`,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function streamSSE(urlStr, body, onEvent, onClose) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body));
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'text/event-stream',
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        const errChunks = [];
        res.on('data', (c) => errChunks.push(c));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(errChunks).toString('utf-8').slice(0, 400)}`)));
        return;
      }
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString('utf-8');
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') { onClose && onClose(); continue; }
            try {
              const evt = JSON.parse(payload);
              onEvent(evt);
            } catch (e) {
              // skip malformed
            }
          }
        }
      });
      res.on('end', () => resolve());
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── 6. Resolve model UUIDs from string IDs ────────────────────────────────
async function resolveModelUUIDs(stringIds) {
  const resp = await postJSON(`${API_BASE}/models`, {});
  // GET endpoint — server may handle POST too, but the standard fetch is GET.
  // Fall through to a real GET via lib if POST didn't work.
  let models;
  if (resp.status === 200) {
    try { models = JSON.parse(resp.body).data; } catch { models = null; }
  }
  if (!models) {
    models = await new Promise((resolve, reject) => {
      const u = new URL(`${API_BASE}/models`);
      const lib = u.protocol === 'https:' ? https : http;
      lib.get({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: { 'Authorization': `Bearer ${API_KEY}` },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')).data); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  const byStringId = new Map();
  for (const m of models) byStringId.set(m.modelId, m);

  const resolved = [];
  const missing = [];
  for (const sid of stringIds) {
    const m = byStringId.get(sid);
    if (m) resolved.push({ stringId: sid, uuid: m.id, name: m.name, provider: m.provider });
    else missing.push(sid);
  }
  return { resolved, missing };
}

// ── 7. Run one query through council ──────────────────────────────────────
async function runOneQuery(query, councilUUIDs, placeholderModelUUID) {
  const startTime = Date.now();
  const events = [];
  let verdictText = '';
  let phase1Responses = [];
  let modelTimings = [];
  let modelErrors = [];
  let crossExamDuration = 0;
  let verdictDuration = 0;
  let totalDuration = 0;
  let costInfo = null;
  let tokensInfo = null;
  let councilMeta = null;
  let errorMessage = null;

  const onEvent = (evt) => {
    events.push({ t: Date.now() - startTime, type: evt.type, ...evt });
    switch (evt.type) {
      case 'council_model_complete':
        modelTimings.push({ modelName: evt.modelName, durationMs: evt.durationMs, tokenCount: evt.tokenCount });
        break;
      case 'council_model_error':
        modelErrors.push({ modelName: evt.modelName, error: evt.error });
        break;
      case 'council_crossexam_complete':
        crossExamDuration = evt.durationMs;
        break;
      case 'council_verdict_chunk':
        verdictText += evt.content || '';
        break;
      case 'council_responses':
        phase1Responses = evt.models || [];
        break;
      case 'done':
        if (evt.council) {
          tokensInfo = evt.tokens;
          costInfo = evt.cost;
          councilMeta = evt.councilMeta;
          verdictDuration = evt.councilMeta?.verdictDurationMs || 0;
          totalDuration = evt.councilMeta?.totalDurationMs || 0;
        }
        break;
      case 'error':
        errorMessage = evt.content || 'Unknown error';
        break;
    }
  };

  try {
    await streamSSE(
      `${API_BASE}/ai/query/stream`,
      {
        modelId: placeholderModelUUID,
        messages: [{ role: 'user', content: query.prompt }],
        councilMode: true,
        councilModelIds: councilUUIDs,
      },
      onEvent,
    );
  } catch (e) {
    errorMessage = errorMessage || e.message;
  }

  const wallDurationMs = Date.now() - startTime;

  return {
    queryId: query.id,
    category: query.category,
    prompt: query.prompt,
    successCriteria: query.successCriteria,
    mode: MODE,
    error: errorMessage,
    verdictText,
    phase1Responses,
    modelTimings,
    modelErrors,
    crossExamDurationMs: crossExamDuration,
    verdictDurationMs: verdictDuration,
    totalDurationMs: totalDuration || wallDurationMs,
    wallDurationMs,
    tokens: tokensInfo,
    cost: costInfo,
    councilMeta,
    eventCount: events.length,
  };
}

// ── 8. Render verdict-only markdown per query ─────────────────────────────
function renderVerdictMd(result) {
  const lines = [];
  lines.push(`# ${result.queryId} — ${result.category} category — ${MODE}`);
  lines.push('');
  lines.push(`**Prompt:** ${result.prompt}`);
  lines.push('');
  lines.push(`**Success criteria:** ${result.successCriteria}`);
  lines.push('');
  lines.push(`**Latency:** ${(result.totalDurationMs / 1000).toFixed(1)}s · **Cost:** $${result.cost?.charged ?? 'n/a'} · **Tokens:** ${result.tokens?.total ?? 'n/a'}`);
  lines.push('');
  if (result.error) {
    lines.push(`> ⚠️ ERROR: ${result.error}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(result.verdictText || '_(no verdict text captured)_');
  lines.push('');
  return lines.join('\n');
}

// ── 9. Main ───────────────────────────────────────────────────────────────
(async () => {
  const targetIds = MODEL_IDS_BY_MODE[MODE];
  const { resolved, missing } = await resolveModelUUIDs(targetIds);

  if (missing.length > 0) {
    console.error(`[apex-suite] missing model IDs (not active in DB): ${missing.join(', ')}`);
    if (resolved.length < 2) {
      console.error('[apex-suite] FATAL: fewer than 2 models resolved — cannot run council');
      process.exit(1);
    }
    console.warn(`[apex-suite] proceeding with ${resolved.length} models: ${resolved.map(r => r.stringId).join(', ')}`);
  }

  console.log('[apex-suite] resolved models:');
  for (const r of resolved) console.log(`  ${r.stringId} → ${r.uuid} (${r.name})`);

  const councilUUIDs = resolved.map(r => r.uuid);
  // The non-council "modelId" field is required by validation but ignored
  // when councilMode=true. Use the first council model's UUID as filler.
  const placeholderUUID = councilUUIDs[0];

  // Filter queries
  let queue = queries.queries;
  if (ONLY) queue = queue.filter(q => q.id === ONLY);
  if (SKIP.length > 0) queue = queue.filter(q => !SKIP.includes(q.id));

  console.log(`[apex-suite] running ${queue.length}/${queries.queries.length} queries sequentially`);

  // Save run metadata
  fs.writeFileSync(
    path.join(OUT_DIR, '_run-meta.json'),
    JSON.stringify({
      mode: MODE,
      timestamp: TIMESTAMP,
      apiBase: API_BASE,
      councilModels: resolved,
      missing,
      queryCount: queue.length,
    }, null, 2),
  );

  const results = [];
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    const t0 = Date.now();
    process.stdout.write(`[${i + 1}/${queue.length}] ${q.id} (${q.category}) — ${q.prompt.slice(0, 60)}...`);
    let r;
    try {
      r = await runOneQuery(q, councilUUIDs, placeholderUUID);
    } catch (e) {
      r = {
        queryId: q.id, category: q.category, prompt: q.prompt, successCriteria: q.successCriteria,
        mode: MODE, error: e.message, verdictText: '', phase1Responses: [], modelTimings: [],
        modelErrors: [], crossExamDurationMs: 0, verdictDurationMs: 0, totalDurationMs: Date.now() - t0,
        wallDurationMs: Date.now() - t0, tokens: null, cost: null, councilMeta: null, eventCount: 0,
      };
    }

    fs.writeFileSync(path.join(OUT_DIR, `${q.id}.json`), JSON.stringify(r, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, `${q.id}.md`), renderVerdictMd(r));

    const status = r.error ? `ERROR: ${r.error}` : `${(r.totalDurationMs / 1000).toFixed(1)}s, $${r.cost?.charged ?? 'n/a'}`;
    process.stdout.write(`  ${status}\n`);
    results.push(r);

    // Small jitter between queries to avoid hammering
    if (i < queue.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // ── _index.md with category-level summary ───────────────────────────────
  const byCategory = {};
  for (const r of results) {
    (byCategory[r.category] = byCategory[r.category] || []).push(r);
  }

  const idx = [];
  idx.push(`# Apex Test Suite — ${MODE} run — ${TIMESTAMP}`);
  idx.push('');
  idx.push(`API base: \`${API_BASE}\``);
  idx.push(`Council models: ${resolved.map(r => r.name).join(', ')}`);
  idx.push(`Queries: ${results.length}/${queries.queries.length}`);
  idx.push('');

  // Category breakdown table (latency + cost averages — quality scores are filled by humans)
  idx.push('## Category breakdown');
  idx.push('');
  idx.push('| Category | Label | Queries | Errors | Avg latency | Avg cost |');
  idx.push('|---|---|---|---|---|---|');
  for (const cat of queries.categories) {
    const rs = byCategory[cat.id] || [];
    const errors = rs.filter(r => r.error).length;
    const latMs = rs.reduce((s, r) => s + (r.totalDurationMs || 0), 0);
    const cost = rs.reduce((s, r) => s + parseFloat(r.cost?.charged || '0'), 0);
    const avgLat = rs.length > 0 ? (latMs / rs.length / 1000).toFixed(1) + 's' : '—';
    const avgCost = rs.length > 0 ? '$' + (cost / rs.length).toFixed(4) : '—';
    idx.push(`| ${cat.id} | ${cat.label} | ${rs.length} | ${errors} | ${avgLat} | ${avgCost} |`);
  }
  idx.push('');
  idx.push('Quality scores (1-5 on voiceUnity, conviction, conciseness, resolution, readability) are scored manually and added to a separate scoring file.');
  idx.push('');

  // Per-query table
  idx.push('## Per-query results');
  idx.push('');
  idx.push('| ID | Category | Latency | Cost | Models OK | Verdict length | Errors |');
  idx.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const lat = r.totalDurationMs ? (r.totalDurationMs / 1000).toFixed(1) + 's' : '—';
    const modOK = r.modelTimings.length;
    const vLen = r.verdictText ? r.verdictText.length : 0;
    const err = r.error ? '⚠️' : '';
    idx.push(`| [${r.queryId}](./${r.queryId}.md) | ${r.category} | ${lat} | $${r.cost?.charged ?? 'n/a'} | ${modOK}/${resolved.length} | ${vLen} chars | ${err} |`);
  }
  idx.push('');

  // Total cost
  const totalCost = results.reduce((s, r) => s + parseFloat(r.cost?.charged || '0'), 0);
  idx.push(`**Total run cost:** $${totalCost.toFixed(4)}`);
  idx.push('');

  fs.writeFileSync(path.join(OUT_DIR, '_index.md'), idx.join('\n'));

  console.log(`[apex-suite] done. Output: ${OUT_DIR}`);
})().catch(e => {
  console.error('[apex-suite] FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
