# ConvoiaAI — Video Generation System (Complete Flow)

## Overview

ConvoiaAI generates AI videos using **Google Veo 2** with AI-generated soundtracks via **Google Lyria 3**, merged using **FFmpeg**. The system supports text-to-video and image-to-video, with optional AI director prompt enhancement.

---

## Architecture

```
User types prompt (or selects Movie Director agent)
        │
        ▼
┌─────────────────────────┐
│  aiController.ts        │  ← Entry point (SSE streaming endpoint)
│  /api/ai/query/stream   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Video Intent Detection  │  ← detectVideoIntent() or Movie Director agent
│  mediaGenerationService  │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │ Think?  │  ← If Think ON or Movie Director agent
    └────┬────┘
         │ YES
         ▼
┌─────────────────────────┐
│  AI Director (Pass 1)    │  ← Uses selected chat model (Claude/GPT/Gemini)
│  Crafts cinematic prompt │     to transform simple prompt into pro-level
│  AIGatewayService        │     film director's vision
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Prompt Enhancement      │  ← parseVideoIntent() + enhanceVideoPrompt()
│  mediaGenerationService  │     Adds camera, lighting, motion, atmosphere
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Google Veo 2 API        │  ← predictLongRunning (async, polls every 10s)
│  Video Generation        │     Returns silent MP4 video (8 seconds)
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Google Lyria 3 API      │  ← generateContent with responseModalities: ['AUDIO']
│  AI Music Generation     │     Generates matching instrumental music
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  FFmpeg Merge            │  ← Combines silent video + audio track
│  Video + Audio → Final   │     Output: MP4 with AAC audio at 192kbps
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Save to Disk            │  ← uploads/videos/{timestamp}-{hex}-final.mp4
│  Served via /api/uploads │     Static file served by Express
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  SSE Response            │  ← Sends videoUrl in 'done' event
│  Frontend renders video  │     <video controls> in MessageBubble
└─────────────────────────┘
```

---

## Detailed Step-by-Step Flow

### Step 1: User Input

User sends a message like: `"a car drifting on a mountain road"`

Two ways to trigger video generation:
1. **Keyword detection**: Prompt contains "generate video", "cinematic sequence", "animate", etc.
2. **Movie Director agent**: When this agent is selected, ALL messages become video requests

### Step 2: Intent Detection

**File**: `backend/src/controllers/aiController.ts` (lines 375-391)

```
detectVideoIntent(lastUserText, hasImageAttachment)
```

Returns:
- `isVideoRequest: boolean` — should we generate a video?
- `confidence: 'high' | 'medium' | 'low'`
- `mediaType: 'text-to-video' | 'image-to-video'`
- `extractedSubject: string` — the scene description with intent keywords stripped

**Movie Director override** (lines 383-391):
When the Movie Director agent is selected, forces `isVideoRequest = true` regardless of keywords.

### Step 3: SSE Setup

Sets up Server-Sent Events headers for real-time progress:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Step 4: AI Director Prompt Enhancement (Think Mode)

**File**: `backend/src/controllers/aiController.ts` (lines 405-442)

When Think is ON (or Movie Director agent):
1. Sends the user's prompt to the selected chat model (Claude/GPT/Gemini)
2. System prompt makes the model act as an elite film director
3. Model returns a detailed cinematic prompt with specific:
   - Camera work (tracking, drone, steadicam, dolly zoom)
   - Lighting (golden hour, rim lighting, volumetric fog)
   - Color palette (teal-orange, desaturated, warm tones)
   - Motion (slow motion, time-lapse, parallax)
   - Atmosphere (rain, dust, smoke, bokeh)
4. Enhanced prompt sent as `thinking_result` SSE event (collapsible in UI)
5. Think tokens tracked for billing

**Status shown**: `"Thinking about your vision..."`

### Step 5: Keyword-Based Prompt Enhancement

**File**: `backend/src/services/mediaGenerationService.ts` (lines 130-274)

Even if Think mode produced a prompt, the service adds additional enhancements:

1. `parseVideoIntent(prompt)` — extracts structured intent:
   - mood (dramatic, calm, energetic, romantic, etc.)
   - style (cinematic, documentary, anime, vintage, etc.)
   - camera (aerial, close-up, tracking, POV, etc.)
   - lighting (golden hour, neon, dramatic, soft, etc.)
   - motion (slow motion, time-lapse, hyperlapse)
   - audio cues (cinematic music, ambient sounds)
   - pacing (fast, slow, building crescendo)

2. `enhanceVideoPrompt(subject, intent)` — builds the final prompt:
   - Adds camera angles based on subject (landscape → drone, car → tracking)
   - Adds lighting based on mood (dramatic → high contrast, calm → golden hour)
   - Adds scene richness (rain → water droplets, forest → volumetric light rays)
   - Adds quality boosters ("photorealistic quality, 4K resolution, professional color grading")

**Status shown**: `"Enhancing cinematic details..."`

### Step 6: Veo 2 API Call (Video Generation)

**File**: `backend/src/services/mediaGenerationService.ts` (lines 299-418)

**API Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning`

**Request body**:
```json
{
  "instances": [{
    "prompt": "A cinematic sequence of a car drifting on a mountain road, captured with dynamic tracking shots, dramatic lighting..."
  }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "16:9",
    "personGeneration": "allow_adult",
    "durationSeconds": 8
  }
}
```

**For image-to-video**, the instance includes:
```json
{
  "prompt": "...",
  "image": {
    "bytesBase64Encoded": "base64data...",
    "mimeType": "image/jpeg"
  }
}
```

**Response**: Operation ID for polling
```json
{
  "name": "models/veo-2.0-generate-001/operations/abc123"
}
```

**Polling**: Every 10 seconds for up to 5 minutes (30 polls max)

**Poll endpoint**: `GET https://generativelanguage.googleapis.com/v1beta/{operationName}`

**Final response** (when `done: true`):
```json
{
  "done": true,
  "response": {
    "generateVideoResponse": {
      "generatedSamples": [{
        "video": {
          "uri": "https://generativelanguage.googleapis.com/v1beta/files/xyz:download?alt=media"
        }
      }]
    }
  }
}
```

**Content safety filter**: If the prompt violates Google's guidelines, the response includes:
```json
{
  "generateVideoResponse": {
    "raiMediaFilteredCount": 1,
    "raiMediaFilteredReasons": ["violated usage guidelines"]
  }
}
```

**Status shown**: `"Generating video... (10s)"`, `"Generating video... (20s)"`, etc.

### Step 7: Video Download & Save

**File**: `backend/src/services/mediaGenerationService.ts` (lines 399-418)

1. Downloads video from the Veo URI (appends API key for auth)
2. Saves to disk: `uploads/videos/{timestamp}-{hex}.mp4`
3. Typical size: 3-5 MB for 8-second clip
4. Returns URL: `/api/uploads/videos/{filename}.mp4`

**Status shown**: `"Saving video..."`

### Step 8: AI Music Generation (Lyria 3)

**File**: `backend/src/services/mediaGenerationService.ts` (lines 450-520)

**Music prompt building** (`buildMusicPrompt()`):

The AI determines the best music style from the video content:

| Video Content | Music Generated |
|--------------|----------------|
| Car/race/chase | Intense cinematic action music with driving percussion |
| Ocean/sunset | Ambient nature music with gentle piano and soft pads |
| City/neon/night | Modern electronic with urban beats and atmospheric synths |
| Space/galaxy | Epic cosmic synths with ethereal choir and deep reverb |
| Forest/mountain | Sweeping orchestral with woodwinds and majestic horns |
| Dramatic mood | Orchestral with deep bass, powerful strings, tension |
| Calm mood | Peaceful piano, soft strings, natural ambience |
| Energetic mood | High-energy electronic with driving beats |

**API Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/lyria-3-pro-preview:generateContent`

**Request body**:
```json
{
  "contents": [{
    "parts": [{
      "text": "intense cinematic action music with driving percussion, powerful orchestral hits, moderate cinematic tempo, instrumental only, no vocals, 8 seconds"
    }]
  }],
  "generationConfig": {
    "responseModalities": ["AUDIO"]
  }
}
```

**Response**: Contains audio as base64 in `inlineData`:
```json
{
  "candidates": [{
    "content": {
      "parts": [
        { "text": "..." },
        { "inlineData": { "mimeType": "audio/mpeg", "data": "base64..." } }
      ]
    }
  }]
}
```

Audio saved to: `uploads/audio/{timestamp}-{hex}.mp3`

**Status shown**: `"Generating AI soundtrack..."`

### Step 9: FFmpeg Merge (Video + Audio)

**File**: `backend/src/services/mediaGenerationService.ts` (lines 495-520)

**Command**:
```bash
ffmpeg -y -i "{video.mp4}" -i "{audio.mp3}" -c:v copy -c:a aac -b:a 192k -shortest -map 0:v:0 -map 1:a:0 "{output-final.mp4}"
```

Flags:
- `-c:v copy` — copies video stream without re-encoding (fast)
- `-c:a aac -b:a 192k` — encodes audio as AAC at 192kbps
- `-shortest` — trims audio to match video length (8 seconds)
- `-map 0:v:0 -map 1:a:0` — takes video from first input, audio from second

Output saved to: `uploads/videos/{timestamp}-{hex}-final.mp4`

Original silent video and audio file are cleaned up after merge.

**Fallback**: If FFmpeg fails (not installed, error), returns the silent video.

**Status shown**: `"Merging audio with video..."`

### Step 10: Token Billing

**File**: `backend/src/controllers/aiController.ts` (lines 460-510)

**Token costs**:
- Video generation: `VIDEO_TOKEN_COST = 5000` tokens (flat)
- AI Director thinking: variable (tracked as `videoThinkTokens`)
- Total: `totalVideoTokens = VIDEO_TOKEN_COST + videoThinkTokens`

**Cost calculation**:
```
Veo model from DB → outputTokenPrice (e.g. $0.0025/token)
providerCost = 5000 × $0.0025 = $12.50
customerPrice = $12.50 × 1.25 (25% markup) = $15.625
```

**Deduction**: `TokenWalletService.deductTokens()` removes tokens from user's wallet

**Usage log**: Written to `UsageLog` table with model=Google Veo 2

### Step 11: SSE Response to Frontend

**Events sent during the pipeline**:

```
data: {"type":"status","content":"Thinking about your vision..."}
data: {"type":"status","content":"Enhancing cinematic details..."}
data: {"type":"thinking_result","content":"**Director's Vision:**\n\n..."}
data: {"type":"status","content":"Generating video... (10s)"}
data: {"type":"status","content":"Generating video... (20s)"}
data: {"type":"status","content":"Generating AI soundtrack..."}
data: {"type":"status","content":"Merging audio with video..."}
data: {"type":"chunk","content":"**Generated Video**\n\n*Enhancements: ...*"}
data: {"type":"done","videoUrl":"/api/uploads/videos/xxx-final.mp4","tokens":{"input":500,"output":5000,"total":5500},"cost":{"charged":"15.625000"},"model":"Google Veo 2","videoGenerated":true}
data: [DONE]
```

### Step 12: Frontend Rendering

**File**: `convoia_frontend/src/components/chat/MessageBubble.tsx` (lines 655-668)

The `done` event's `videoUrl` is stored on the message. `MessageBubble` renders:

```html
<video controls playsInline
  style="max-width: 480px; border-radius: 12px; background: #000"
  src="/api/uploads/videos/xxx-final.mp4" />
<button>Download video</button>
```

### Step 13: Persistence

**File**: `backend/src/routes/conversationRoutes.ts` (lines 111-133)

When the conversation is saved, `videoUrl` is stored in the `ChatMessage` table.
On page refresh, messages are loaded with `videoUrl` and the video player renders again.

---

## File Map

### Backend

| File | Purpose |
|------|---------|
| `backend/src/controllers/aiController.ts` | Entry point — video intent detection, Think mode director, SSE handling, token billing |
| `backend/src/services/mediaGenerationService.ts` | Core service — intent detection, prompt parsing, prompt enhancement, Veo API, Lyria API, FFmpeg merge |
| `backend/src/services/aiGatewayService.ts` | Used by Think mode to call chat model for AI director prompt |
| `backend/src/services/tokenWalletService.ts` | Token deduction from user's wallet |
| `backend/src/routes/conversationRoutes.ts` | Saves/loads `videoUrl` to/from database |
| `backend/prisma/schema.prisma` | `ChatMessage.videoUrl` column, `AIModel` for Veo 2 pricing |

### Frontend

| File | Purpose |
|------|---------|
| `convoia_frontend/src/contexts/ChatContext.tsx` | SSE stream reader — handles `videoUrl` in `done` event, dispatches `tokens:refresh` |
| `convoia_frontend/src/components/chat/MessageBubble.tsx` | Renders `<video controls>` player + download button |
| `convoia_frontend/src/contexts/TokenContext.tsx` | Listens for `tokens:refresh` event, updates wallet balance |
| `convoia_frontend/src/types/index.ts` | `Message.videoUrl` type definition |

### Database

| Table | Fields Used |
|-------|-------------|
| `AIModel` | Veo 2 model record (id, pricing, markup) |
| `Agent` | Movie Director agent record |
| `ChatMessage` | `videoUrl` column for persistence |
| `UsageLog` | Token usage tracking per video generation |
| `TokenWallet` | Token balance deduction |

### Server Files

| Path | Content |
|------|---------|
| `uploads/videos/*.mp4` | Generated videos (silent + final with audio) |
| `uploads/audio/*.mp3` | Temporary Lyria audio (deleted after merge) |

### External APIs

| API | Model | Endpoint | Purpose |
|-----|-------|----------|---------|
| Google Veo 2 | `veo-2.0-generate-001` | `predictLongRunning` | Video generation |
| Google Lyria 3 | `lyria-3-pro-preview` | `generateContent` | AI music generation |
| FFmpeg | — | Local binary | Audio + video merge |

### Available Veo Models (on your API key)

| Model | Status |
|-------|--------|
| `veo-2.0-generate-001` | Stable (currently used) |
| `veo-3.0-generate-001` | Stable |
| `veo-3.0-fast-generate-001` | Stable (faster) |
| `veo-3.1-generate-preview` | Preview (newest) |
| `veo-3.1-fast-generate-preview` | Preview (fast) |
| `veo-3.1-lite-generate-preview` | Preview (lite) |

---

## Limitations

1. **Video duration**: 8 seconds max per generation (Veo API limit)
2. **No text/logos**: Veo cannot render text, brand names, or UI elements
3. **Content safety**: Google filters violent, explicit, or policy-violating content
4. **Audio**: Lyria generates music, not sound effects or voice-over
5. **No video-to-video editing**: V2V is not yet implemented (Veo supports it, code placeholder exists)
6. **FFmpeg required**: Must be installed on the server for audio merge
7. **Generation time**: 1-3 minutes per video (polling every 10s)
