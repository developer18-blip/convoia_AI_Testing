// Simulate the router path end-to-end. Mirrors aiController: classifyIntent + classifyQueryComplexity → routeToOptimalModel.
import { PrismaClient } from '@prisma/client';
import { MODEL_PROFILES, hydrateModelProfiles } from '../dist/src/ai/modelProfiles.js';
import { routeToOptimalModel } from '../dist/src/services/llmRouter.js';
import { classifyIntent } from '../dist/src/services/intentClassifier.js';
import { classifyQueryComplexity } from '../dist/src/services/aiGatewayService.js';

const prisma = new PrismaClient();
await hydrateModelProfiles(prisma);

const cases = [
  { label: '"hey" (casual greeting)', text: 'hey' },
  { label: 'coding question', text: 'Write a Python function that reverses a linked list in place.' },
  { label: 'long-form essay', text: 'Write a 1500-word essay on the philosophical implications of free will in a deterministic universe.' },
  { label: 'research query', text: 'What are the latest 2025 studies on mRNA vaccine efficacy against new variants? Cite sources.' },
];

const mapped = MODEL_PROFILES.filter(p => p.dbId).length;
console.log(`Hydrated: ${mapped}/${MODEL_PROFILES.length} profiles\n`);

for (const c of cases) {
  const intent = classifyIntent(c.text, false);
  const complexity = classifyQueryComplexity(c.text);
  const result = routeToOptimalModel({
    intent,
    complexity,
    hasVisionContent: false,
    thinkingEnabled: false,
    tokenBalance: 1_000_000,
    estimatedInputTokens: Math.ceil(c.text.length / 4),
    conversationModelId: undefined,
  });
  console.log(`${c.label}`);
  console.log(`  text        : ${c.text.substring(0, 80)}${c.text.length > 80 ? '…' : ''}`);
  console.log(`  intent      : ${intent.intent}  (confidence: ${intent.confidence})`);
  console.log(`  complexity  : ${complexity}`);
  console.log(`  → picked    : ${result.selectedModel.displayName}  (${result.selectedModel.modelId})`);
  console.log(`  reason      : ${result.reason}`);
  console.log(`  confidence  : ${result.confidence}`);
  if (result.costSavings) console.log(`  savings     : ${result.costSavings}`);
  console.log(`  alternatives: ${result.alternatives.slice(0, 2).map(a => a.displayName).join(', ')}`);
  console.log('');
}

await prisma.$disconnect();
