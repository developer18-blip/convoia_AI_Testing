#!/usr/bin/env node
/**
 * Regenerate _index.md for a captured run directory by re-reading all
 * <id>.json artifacts. Useful after retrying failed queries from a
 * separate run dir and merging files back in.
 *
 * Usage: node scripts/apex-test-suite/regen-index.js <run-dir>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('usage: regen-index.js <run-dir>'); process.exit(1); }
const queries = JSON.parse(fs.readFileSync(path.join(__dirname, 'queries.json'), 'utf-8'));
const meta = JSON.parse(fs.readFileSync(path.join(dir, '_run-meta.json'), 'utf-8'));

const results = [];
for (const q of queries.queries) {
  const f = path.join(dir, `${q.id}.json`);
  if (!fs.existsSync(f)) continue;
  results.push(JSON.parse(fs.readFileSync(f, 'utf-8')));
}

const byCategory = {};
for (const r of results) (byCategory[r.category] = byCategory[r.category] || []).push(r);

const idx = [];
idx.push(`# Apex Test Suite — ${meta.mode} run — ${meta.timestamp}`);
idx.push('');
idx.push(`API base: \`${meta.apiBase}\``);
idx.push(`Council models: ${meta.councilModels.map(r => r.name).join(', ')}`);
idx.push(`Queries: ${results.length}/${queries.queries.length}`);
idx.push('');
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
idx.push('## Per-query results');
idx.push('');
idx.push('| ID | Category | Latency | Cost | Models OK | Verdict length | Errors |');
idx.push('|---|---|---|---|---|---|---|');
for (const r of results) {
  const lat = r.totalDurationMs ? (r.totalDurationMs / 1000).toFixed(1) + 's' : '—';
  const modOK = r.modelTimings ? r.modelTimings.length : 0;
  const totalModels = meta.councilModels.length;
  const vLen = r.verdictText ? r.verdictText.length : 0;
  const err = r.error ? '⚠️' : '';
  idx.push(`| [${r.queryId}](./${r.queryId}.md) | ${r.category} | ${lat} | $${r.cost?.charged ?? 'n/a'} | ${modOK}/${totalModels} | ${vLen} chars | ${err} |`);
}
idx.push('');
const totalCost = results.reduce((s, r) => s + parseFloat(r.cost?.charged || '0'), 0);
idx.push(`**Total run cost:** $${totalCost.toFixed(4)}`);
idx.push('');

fs.writeFileSync(path.join(dir, '_index.md'), idx.join('\n'));
console.log(`regenerated ${path.join(dir, '_index.md')} with ${results.length} queries, total $${totalCost.toFixed(4)}`);
