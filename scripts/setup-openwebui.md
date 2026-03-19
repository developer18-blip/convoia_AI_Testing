# Open WebUI Setup — Convoia AI Gateway

## Prerequisites

- Backend running on `http://localhost:5000`
- Frontend running on `http://localhost:5173`
- Open WebUI installed: `pip install open-webui`
- A registered Convoia user account

---

## Step 1: Start All Services

Run the all-in-one launcher:

```bash
scripts/start-all.bat
```

Or start each service individually:

```bash
# Terminal 1 — Backend
cd backend && npm start

# Terminal 2 — Frontend
cd frontend/convoia-ai-gateway && npm run dev

# Terminal 3 — Open WebUI
open-webui serve --port 3001
```

---

## Step 2: Open Open WebUI

Go to: **http://localhost:3001**

Create an admin account when prompted (this is the Open WebUI admin, separate from your Convoia account).

---

## Step 3: Get Your Convoia JWT Token

### Option A — From the Frontend

1. Go to `http://localhost:5173/login`
2. Login with your Convoia account
3. Open browser DevTools (`F12`)
4. Go to **Application** → **Local Storage** → `http://localhost:5173`
5. Copy the value of `convoia_token`

### Option B — Via API

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "yourpassword"}'
```

Copy the `token` field from the JSON response.

### Option C — Use a Convoia API Key

If you have a Convoia API key (`cvai_...`), you can use that instead of a JWT token. Generate one at:

```bash
curl -X POST http://localhost:5000/api/keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Open WebUI"}'
```

Copy the `rawKey` from the response.

---

## Step 4: Configure Open WebUI

1. Click the **profile icon** (top right) in Open WebUI
2. Go to **Admin Panel** → **Settings** → **Connections**
3. Under **OpenAI API**:
   - **API Base URL**: `http://localhost:5000/api/ai/openwebui`
   - **API Key**: paste your JWT token or API key (`cvai_...`)
4. Click **Save** then **Verify Connection**
5. You should see a green checkmark confirming the connection

---

## Step 5: Test It

1. Click **New Chat** in Open WebUI
2. All 16 Convoia AI models should appear in the model dropdown
3. Select any model (e.g., GPT-4o, Claude 4 Sonnet, Gemini 2.0 Flash)
4. Send a test message: "Hello, what model are you?"
5. Verify:
   - You get a response from the AI
   - Your wallet balance decreases in the Convoia dashboard
   - The query appears in your usage history at `http://localhost:5173/dashboard`

---

## Verify with Test Script

Run the automated test script to verify everything works:

```bash
node scripts/test-openwebui.js
```

This will:
- Login to your Convoia account
- Fetch the model list via the OpenAI-compatible endpoint
- Send a test chat completion
- Print the response and cost

---

## Troubleshooting

### "Unauthorized" error in Open WebUI
- Your JWT token may have expired (they last 15 minutes)
- Generate a fresh token or use a Convoia API key instead (no expiry)

### Models not showing in dropdown
- Ensure backend is running: `curl http://localhost:5000/health`
- Check the connection URL ends with `/api/ai/openwebui` (no trailing slash)

### "Insufficient balance" error
- Top up your wallet via the Convoia dashboard or API

### CORS errors in browser console
- The backend is configured to allow `http://localhost:3001`
- If running on a different port, update `OPEN_WEBUI_URL` in `backend/.env`

---

## Architecture

```
Open WebUI (port 3001)
    │
    │  OpenAI-compatible API calls
    │  GET  /api/ai/openwebui/models
    │  POST /api/ai/openwebui/chat/completions
    │
    ▼
Convoia Backend (port 5000)
    │
    │  Auth (JWT or API key) → Wallet check → Budget check
    │
    ▼
AI Providers (OpenAI, Anthropic, Google, DeepSeek, Mistral, Groq)
    │
    ▼
Response → Billing → Usage tracking → Return to Open WebUI
```
