// End-to-end council smoke test. Calls runCouncil() directly against prod DB and
// live provider APIs. Logs every SSE-equivalent event + final UsageLog row count.

import { PrismaClient } from '@prisma/client';
import { runCouncil } from '../dist/src/services/councilService.js';

const prisma = new PrismaClient();

const USER_ID = '6d592b36-f585-40ab-9e6b-aeca60565740';           // ai@convoia.com
const ORG_ID  = '5deaaf1f-21dd-4c05-8f0d-d36bc618be9e';
const COUNCIL_MODELS = [
  '6691e209-e88e-42f2-990a-be87337a20bc', // Claude Sonnet 4.6
  '20b5e185-084a-4669-b975-5e2a477349f4', // GPT-5.4
  '30f065f7-0192-45c6-a39b-f8df241d353a', // Gemini 3.1 Pro
];
const QUERY = 'What is the best programming language for backend development in 2026? Give a direct recommendation.';

const walletBefore = await prisma.tokenWallet.findUnique({ where: { userId: USER_ID } });
const usageBefore  = await prisma.usageLog.count({ where: { userId: USER_ID } });
console.log(`Before: wallet=${walletBefore.tokenBalance.toLocaleString()} tokens | usageLog rows=${usageBefore}\n`);

let verdictText = '';
const eventTimestamps = [];
const ev = (type, data = {}) => {
  const elapsed = eventTimestamps.length ? Date.now() - eventTimestamps[0] : 0;
  eventTimestamps.push(Date.now());
  const payload = Object.keys(data).length ? ` ${JSON.stringify(data).substring(0, 160)}` : '';
  console.log(`[+${String(elapsed).padStart(5, ' ')}ms] ${type}${payload}`);
};

await new Promise((resolve, reject) => {
  runCouncil(
    {
      userId: USER_ID,
      organizationId: ORG_ID,
      modelIds: COUNCIL_MODELS,
      query: QUERY,
      intent: 'question',
      thinkingEnabled: false,
    },
    {
      onModelStart:       (name, i, s) => ev('council_model_start',       { m: name, i, s }),
      onModelProgress:    (_n, _i, _s) => { /* too chatty, suppress */ },
      onModelComplete:    (name, i, d, t) => ev('council_model_complete', { m: name, i, ms: d, tok: t }),
      onModelError:       (name, i, e) => ev('council_model_error',       { m: name, i, e }),
      onCrossExamStart:   ()             => ev('council_crossexam_start'),
      onCrossExamComplete:(ms)           => ev('council_crossexam_complete', { ms }),
      onVerdictStart:     ()             => ev('council_verdict_start'),
      onVerdictChunk:     (text)         => { verdictText += text; process.stdout.write('.'); },
      onVerdictComplete:  ()             => { process.stdout.write('\n'); ev('council_verdict_complete'); },
      onDone:             (metadata)     => { ev('done', { council: true, tokensUsed: metadata.totalWalletTokens, cost: metadata.totalCost.toFixed(6), ms: metadata.totalDurationMs }); resolve(metadata); },
      onError:            (err)          => { ev('error', { msg: err.message }); reject(err); },
    },
  ).catch(reject);
});

console.log('\n════════ VERDICT TEXT ════════');
console.log(verdictText);
console.log('══════════════════════════════\n');

const walletAfter = await prisma.tokenWallet.findUnique({ where: { userId: USER_ID } });
const usageAfter  = await prisma.usageLog.count({ where: { userId: USER_ID } });
const newRows     = await prisma.usageLog.findMany({
  where: { userId: USER_ID },
  orderBy: { createdAt: 'desc' },
  take: usageAfter - usageBefore,
  select: { modelId: true, prompt: true, tokensInput: true, tokensOutput: true, providerCost: true, customerPrice: true, createdAt: true },
  include: undefined,
});

console.log(`After:  wallet=${walletAfter.tokenBalance.toLocaleString()} tokens | usageLog rows=${usageAfter}`);
console.log(`Delta:  wallet=-${(walletBefore.tokenBalance - walletAfter.tokenBalance).toLocaleString()} tokens | +${usageAfter - usageBefore} usageLog rows\n`);

console.log('New UsageLog rows (most recent first):');
const modelNames = await prisma.aIModel.findMany({ where: { id: { in: newRows.map(r => r.modelId) } }, select: { id: true, name: true } });
const nameMap = Object.fromEntries(modelNames.map(m => [m.id, m.name]));
newRows.reverse().forEach((r, i) => {
  console.log(`  ${i + 1}. ${nameMap[r.modelId] || r.modelId.substring(0, 8)} | in=${r.tokensInput} out=${r.tokensOutput} | cogs=$${r.providerCost.toFixed(6)} | cust=$${r.customerPrice.toFixed(6)} | "${r.prompt.substring(0, 60)}"`);
});

await prisma.$disconnect();
