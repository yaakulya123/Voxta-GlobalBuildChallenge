# Voxta — Real-Time Accessible Video Calling

**NYUAD Global Build Challenge 2026 | "Bridge the Gap" Track**

> *"Every voice deserves to be heard."*

Voxta is a real-time accessible video call platform that bridges People of Determination (deaf/hard-of-hearing) and typical users in the same call — simultaneously. Signing becomes voice. Speech becomes ASL signs. No interpreter. No app install. Just a browser.

---

## The Problem

70 million people worldwide are deaf. Every day they join video calls and face the same broken experience:

- **Auto-captions** only transcribe the hearing person — the deaf person's hands are invisible
- **Typing in chat** means 40 words/minute against 130 — they are permanently three sentences behind, unable to interrupt or react naturally
- **Professional interpreters** cost $100+/hr and must be booked days in advance
- **Zoom/Teams/Meet "translation"** is language translation (English→Arabic) — not sign language. Zero platforms have a sign-to-voice pipeline

Voxta is the first tool to make a video call feel natural for both sides simultaneously.

---

## How It Works

### Bidirectional Pipeline

```
Person of Determination (signs):
  Camera → MediaPipe landmarks → Rule classifier → Claude Haiku → gTTS → Voice 🔊
                                      ↓ (if no rule match)
                                  GPT-4o LLM fallback

Typical user (speaks):
  Microphone → Web Speech API → Live captions + ASL sign GIFs 🤟
```

### Sign Recognition Pipeline (Person of Determination → Voice)

1. **Gesture trigger** — user holds a closed fist for 2 seconds to start recording (MediaPipe GestureRecognizer)
2. **Landmark capture** — during recording, MediaPipe tracks 21 hand landmark coordinates (x, y, z) at 200ms intervals
3. **Frame trimming** — start/end frames discarded to remove trigger/release artifacts
4. **Rule-based classifier** (`flow_rules.py`) — instant, zero-API recognition for common signs:
   - Analyzes hand shape (fist, open, V, pointing, ILY, thumbs-up)
   - Analyzes motion pattern (circular, bouncing, horizontal sweep, stationary, up/down)
   - Maps body zone (forehead, face, chin/neck, chest, stomach)
   - Matches against rule table → returns sign word instantly
5. **LLM fallback** (`flow_landmarks.py`) — if no rule matches, formats the landmark trajectory as structured text and sends to GPT-4o via OpenRouter
6. **Claude Haiku** (`flow1.py`) — converts ASL gloss tokens into natural spoken English
7. **gTTS** — synthesizes MP3 audio, encodes as base64, broadcasts to all room participants
8. **Confirmation** — deaf sender sees "Sent: I'm sorry" caption; hearing peer hears the voice

### Speech → Signs Pipeline (Typical user → Visual ASL)

1. **Web Speech API** — browser-native continuous speech recognition (Chrome)
2. **Relay** — transcribed text sent to backend, broadcast as `spoken_text` to all peers
3. **Live captions** — displayed on deaf user's screen with auto-fade after 4 seconds
4. **ASL sign panel** — top-right TV-interpreter-style window cycles through each word:
   - Checks local cache first (`/asl/words/word.gif` — 117 words downloaded from Lifeprint.com)
   - Falls back to Lifeprint.com remote GIF URL
   - Falls back to letter-by-letter fingerspelling if no sign found
   - Supports both `.gif` and `.mp4` sign formats

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser — React + Vite (port 5174)                          │
│  ├── WebRTC peer-to-peer video (offer/answer/ICE via WS)     │
│  ├── MediaPipe GestureRecognizer — landmark capture          │
│  ├── Web Speech API — hearing user speech → text             │
│  ├── ASLPanel — sign GIF display (local cache + remote)      │
│  ├── ClosedCaptions — auto-fading transcription overlay      │
│  └── WebSocket client — signaling + AI message relay         │
└──────────────────────────┬───────────────────────────────────┘
                           │ WebSocket /ws/{room_id}
┌──────────────────────────▼───────────────────────────────────┐
│  FastAPI Backend — Uvicorn (port 8000)                       │
│  ├── RoomManager — in-memory multi-room WebSocket registry   │
│  ├── WebRTC relay — offer / answer / ICE passthrough         │
│  ├── landmark_clip handler → flow_landmarks.py               │
│  │     ├── flow_rules.py — instant rule-based classifier     │
│  │     └── GPT-4o LLM fallback (OpenRouter)                  │
│  ├── video_clip handler → flow_video.py (JPEG fallback)      │
│  │     └── Gemini 2.5 Pro vision (OpenRouter)                │
│  ├── flow1.py — Claude Haiku gloss→sentence + gTTS audio     │
│  └── spoken_text relay — hearing speech → all peers          │
└──────────────────────────────────────────────────────────────┘
```

---

## AI Models

| Model | Purpose | Provider |
|-------|---------|----------|
| GPT-4o | Landmark trajectory → ASL word (LLM fallback) | OpenRouter |
| Gemini 2.5 Pro | JPEG frame sequence → ASL word (vision fallback) | OpenRouter |
| Claude Haiku 4.5 | ASL gloss tokens → natural English sentence | Anthropic |
| gTTS | English sentence → MP3 audio | Google (free) |
| MediaPipe GestureRecognizer | Hand landmark tracking (21 points) | Browser (local) |
| Web Speech API | Continuous speech-to-text | Browser native |

### Recognition Priority

```
landmark_clip received
  └── flow_rules.py (rule-based, instant, no API)
        ├── match found → return word immediately
        └── no match → GPT-4o with structured trajectory text
                            └── still unclear → "No sign detected"
```

---

## Key Features

- **Gesture-triggered recording** — hold closed fist 2s to start/stop signing clip
- **Bidirectional translation** — deaf→voice AND hearing→ASL signs simultaneously
- **Rule-based ASL classifier** — instant recognition for 17 core signs with zero latency
- **ASL sign GIF panel** — 117 locally cached signs + remote fallback + fingerspelling
- **Live captions** — auto-fade after 4s, half-size, non-intrusive
- **TTS broadcast** — translated voice plays for all participants in the room
- **In-call chat** with AI meeting summarizer (Claude via OpenRouter)
- **Screen sharing** and background blur toggle
- **WebRTC peer-to-peer** — no video routed through server

---

## Supported Signs (Rule-Based, Instant)

| Sign | Hand Shape | Motion | Body Zone |
|------|-----------|--------|-----------|
| SORRY | fist | circular | chest |
| PLEASE | open | circular | chest |
| YES | fist | bouncing | any |
| THANK YOU | open | sweeps down | face/chin |
| HELLO | open | horizontal sweep | forehead/face |
| HELP | fist | moves up | chest |
| STOP | open | sweeps down sharply | any |
| NO | point/V | horizontal | face/chest |
| LOVE | fist | stationary | chest |
| I LOVE YOU | ILY | stationary | any |
| GOOD | open | stationary | face/chin |
| THUMBS UP | thumbs-up | stationary | any |
| WAIT | open | bouncing | chest |
| I / ME | point | stationary | chest |
| MORE | partial | bouncing | any |

*All other signs fall back to GPT-4o LLM recognition.*

---

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── Home.tsx                # Login — name, room code, role selection
│   │   ├── CallRoom.tsx            # Main call logic — recording, WebRTC, speech
│   │   ├── controls/
│   │   │   └── BottomControls.tsx  # Mic, video, record, screen share, leave
│   │   ├── layout/
│   │   │   ├── VideoCallLayout.tsx
│   │   │   └── Sidebar.tsx         # Chat + AI meeting summarizer
│   │   ├── video/
│   │   │   ├── FocusVideo.tsx      # Main peer video + captions + ASL panel
│   │   │   └── ThumbnailGrid.tsx   # Local + remote thumbnail strip
│   │   └── ui/
│   │       ├── ASLPanel.tsx        # Sign GIF display (local→remote→fingerspell)
│   │       ├── ClosedCaptions.tsx  # Auto-fading caption overlay
│   │       └── login.tsx           # Role selection UI (Typical / Person of Determination)
│   └── lib/
│       ├── socket.ts               # WebSocket client
│       ├── webrtc.ts               # WebRTC peer connection
│       ├── speechRecognition.ts    # Web Speech API wrapper
│       ├── gestureDetector.ts      # MediaPipe — landmarks + hold detection
│       ├── aslWordMap.ts           # Word → sign GIF URL (local cache + Lifeprint)
│       └── aslLocalWords.ts        # Auto-generated local GIF map (117 words)
├── backend/
│   ├── main.py                     # FastAPI server + WebSocket message routing
│   ├── room_manager.py             # Multi-room WebSocket registry
│   ├── flow_rules.py               # Rule-based ASL classifier (instant, no API)
│   ├── flow_landmarks.py           # Landmark trajectory → GPT-4o → gloss
│   ├── flow_video.py               # JPEG frames → Gemini Vision → gloss (fallback)
│   ├── flow1.py                    # Gloss → Claude Haiku → sentence + gTTS audio
│   ├── flow3.py                    # Single-frame legacy recognizer
│   └── requirements.txt
├── public/
│   ├── asl/
│   │   ├── *.gif                   # Fingerspelling alphabet (A-Z)
│   │   └── words/                  # 117 downloaded ASL word GIFs (Lifeprint)
│   └── voxta-logo.png
├── download_asl.py                 # Script to download ASL GIFs from Lifeprint
├── deploy.sh                       # Cloudflare tunnel deployment
├── .env.example                    # Frontend env template
├── backend/.env.example            # Backend env template
└── package.json
```

---

## Setup

### Prerequisites

- Node.js v18+
- Python 3.10+
- `cloudflared` for tunnel deployment (`brew install cloudflared`)

### 1. Clone

```bash
git clone https://github.com/yaakulya123/Voxta-GlobalBuildChallenge.git
cd Voxta-GlobalBuildChallenge
```

### 2. Frontend

```bash
npm install
```

### 3. Backend

```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 4. Environment Variables

```bash
# Frontend (root .env)
cp .env.example .env
# Leave VITE_BACKEND_URL= empty for local dev

# Backend
cp backend/.env.example backend/.env
# Fill in your API keys:
#   OPENROUTER_API_KEY  → https://openrouter.ai/keys
#   ANTHROPIC_API_KEY   → https://console.anthropic.com/
```

### 5. (Optional) Download ASL sign GIFs locally

```bash
pip install requests
python download_asl.py
# Downloads ~117 word GIFs to public/asl/words/ and generates src/lib/aslLocalWords.ts
```

### 6. Run Locally

```bash
# Terminal 1 — Backend
source venv/bin/activate
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
npm run dev
```

Open `http://localhost:5174`

### 7. Deploy with Cloudflare Tunnel (shareable link)

```bash
./deploy.sh
```

Starts backend + frontend, creates two Cloudflare tunnels, prints a shareable HTTPS URL. Both participants enter the same room code to connect.

---

## Usage

1. Open the app URL in **Chrome** (Web Speech API requires Chrome)
2. Enter display name and room code
3. Select role: **Typical** (hearing) or **Person of Determination** (deaf/signing)
4. Share the same URL + room code with the other participant

**Person of Determination:**
- Hold a **closed fist for 2 seconds** → recording starts (countdown shown)
- Sign your message
- Release or wait for auto-stop → AI processes → hearing peer hears your voice

**Typical user:**
- Speak normally → captions appear for deaf peer
- ASL sign GIF panel (top-right of main video) cycles through each word you say

---

## Future Roadmap

The architecture is model-agnostic by design. The landmark pipeline, motion classifier, and LLM bridge are all in place. Improvements slot in without rebuilding:

- **Plug in WLASL** — 2,000-word trained ASL classifier replaces the rule engine instantly
- **Multi-sign sentences** — currently recognizes one sign per clip; extend to sequences
- **BSL / LSF / ArSL** — same pipeline, different training data
- **SDK for Zoom/Teams/Meet** — augment existing platforms rather than replace them
- **Real-time finger-spelling** — use landmark stream for live letter-by-letter spelling

---

## Team

Built in 24 hours at the NYUAD Global Build Challenge 2026 — "Bridge the Gap" track.
