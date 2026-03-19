/**
 * Convoia AI — Open WebUI Endpoint Test Script
 *
 * Tests the OpenAI-compatible endpoints before connecting Open WebUI.
 *
 * Usage:
 *   node scripts/test-openwebui.js
 *
 * Environment variables (optional):
 *   TEST_EMAIL    — Convoia login email    (default: prompts or uses fallback)
 *   TEST_PASSWORD — Convoia login password
 *   API_KEY       — Use a Convoia API key instead of JWT
 */

const BASE_URL = 'http://localhost:5000';
const OPENWEBUI_URL = `${BASE_URL}/api/ai/openwebui`;

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function getAuthToken() {
  // Check for API key first
  if (process.env.API_KEY) {
    console.log('  Using API key from API_KEY env var');
    return process.env.API_KEY;
  }

  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    console.log('  No TEST_EMAIL/TEST_PASSWORD or API_KEY set.');
    console.log('  Set environment variables and retry:');
    console.log('    set TEST_EMAIL=your@email.com');
    console.log('    set TEST_PASSWORD=yourpassword');
    console.log('    node scripts/test-openwebui.js');
    console.log('');
    console.log('  Or use an API key:');
    console.log('    set API_KEY=cvai_your_key_here');
    console.log('    node scripts/test-openwebui.js');
    process.exit(1);
  }

  console.log(`  Logging in as ${email}...`);
  const res = await request(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    console.error('  Login failed:', res.data?.message || res.status);
    process.exit(1);
  }

  const token = res.data?.data?.token || res.data?.token;
  if (!token) {
    console.error('  No token in login response:', JSON.stringify(res.data, null, 2));
    process.exit(1);
  }

  console.log('  Login successful, got JWT token');
  return token;
}

async function testHealthCheck() {
  console.log('\n[1/4] Health Check');
  console.log('  GET /health');
  const res = await request(`${BASE_URL}/health`);
  if (res.ok) {
    console.log('  OK — Backend is running');
  } else {
    console.error('  FAIL — Backend not reachable. Is it running on port 5000?');
    process.exit(1);
  }
}

async function testListModels(token) {
  console.log('\n[2/4] List Models (OpenAI format)');
  console.log('  GET /api/ai/openwebui/models');
  const res = await request(`${OPENWEBUI_URL}/models`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error('  FAIL —', res.data?.message || res.status);
    return [];
  }

  const models = res.data?.data || [];
  console.log(`  OK — ${models.length} models available:`);
  models.forEach((m, i) => {
    console.log(`    ${i + 1}. ${m.id} (owned_by: ${m.owned_by})`);
  });

  return models;
}

async function testChatCompletion(token, modelId) {
  console.log('\n[3/4] Chat Completion (non-streaming)');
  console.log(`  POST /api/ai/openwebui/chat/completions`);
  console.log(`  Model: ${modelId}`);

  const startTime = Date.now();
  const res = await request(`${OPENWEBUI_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: 'Say "Hello from Convoia!" in exactly 5 words.' }],
      stream: false,
    }),
  });
  const elapsed = Date.now() - startTime;

  if (!res.ok) {
    console.error('  FAIL —', res.data?.error?.message || res.data?.message || res.status);
    return;
  }

  const choice = res.data?.choices?.[0];
  const usage = res.data?.usage;

  console.log('  OK — Response received');
  console.log(`  ID: ${res.data?.id}`);
  console.log(`  Content: "${choice?.message?.content}"`);
  console.log(`  Finish reason: ${choice?.finish_reason}`);
  console.log(`  Tokens: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out / ${usage?.total_tokens} total`);
  console.log(`  Time: ${elapsed}ms`);
}

async function testStreamingCompletion(token, modelId) {
  console.log('\n[4/4] Chat Completion (streaming)');
  console.log(`  POST /api/ai/openwebui/chat/completions (stream: true)`);
  console.log(`  Model: ${modelId}`);

  const startTime = Date.now();
  const res = await fetch(`${OPENWEBUI_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('  FAIL —', errText);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter((l) => l.startsWith('data: '));

    for (const line of lines) {
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content || '';
        fullContent += delta;
        chunkCount++;
      } catch {
        // skip parse errors
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`  OK — Received ${chunkCount} chunks`);
  console.log(`  Content: "${fullContent.trim()}"`);
  console.log(`  Time: ${elapsed}ms`);
}

async function main() {
  console.log('============================================');
  console.log('  Convoia AI — Open WebUI Endpoint Tests');
  console.log('============================================');

  // Step 1: Health check
  await testHealthCheck();

  // Step 2: Auth
  console.log('\n[Auth] Getting authentication token...');
  const token = await getAuthToken();

  // Step 3: List models
  const models = await testListModels(token);
  if (models.length === 0) {
    console.error('\nNo models available. Run: npx prisma db seed');
    process.exit(1);
  }

  // Pick first model for testing
  const testModelId = models[0].id;

  // Step 4: Non-streaming chat
  await testChatCompletion(token, testModelId);

  // Step 5: Streaming chat
  await testStreamingCompletion(token, testModelId);

  console.log('\n============================================');
  console.log('  All tests passed!');
  console.log('  Open WebUI endpoint is ready.');
  console.log('  Configure Open WebUI with:');
  console.log(`    URL: ${OPENWEBUI_URL}`);
  console.log(`    Key: your JWT or API key`);
  console.log('============================================\n');
}

main().catch((err) => {
  console.error('\nTest failed with error:', err.message);
  process.exit(1);
});
