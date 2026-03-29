# SignBridge — Architecture Document

SignBridge is a real-time video call app that bridges deaf/mute and hearing users. Deaf users sign with their hands; hearing users speak. The app translates in both directions automatically.

---

## Directory Structure

```
socia/
├── backend/               # Python FastAPI WebSocket server
│   ├── main.py            # Entry point, WebSocket handler, message router
│   ├── room_manager.py    # Room/WebSocket connection manager (singleton)
│   ├── flow1.py           # Flow 1: ASL gloss tokens → TTS audio
│   ├── flow2.py           # Flow 2: Audio chunk → ASL gloss tokens (Whisper)
│   ├── flow3.py           # Flow 3: Video frame → ASL sign recognition (Claude Vision)
│   ├── requirements.txt   # Python dependencies
│   └── venv/              # Python virtual environment (not in git)
│
├── frontend/              # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── main.jsx               # React app entry point
│   │   ├── App.jsx                # Router: / → JoinScreen, /room/:id → CallRoom
│   │   ├── socket.js              # WebSocket client (singleton, with send queue)
│   │   ├── webrtc.js              # WebRTC peer connection logic
│   │   ├── gestureDetector.js     # MediaPipe Hands + frame capture for sign detection
│   │   ├── aslRenderer.js         # Renders ASL fingerspelling images on screen
│   │   ├── audioPlayer.js         # Plays base64 MP3 audio (TTS output)
│   │   └── components/
│   │       ├── JoinScreen.jsx     # Landing page (name, room ID, role selection)
│   │       ├── CallRoom.jsx       # Main call UI (video, controls, all logic)
│   │       ├── VideoTile.jsx      # Single video element component
│   │       └── ASLOverlay.jsx     # Overlay panel showing ASL sign images
│   └── public/
│       └── asl/                   # ASL fingerspelling GIFs (a.gif – z.gif)
│
└── .gitignore
```

---

## How to Run

### Backend
```bash
cd backend
venv/bin/uvicorn main:app --reload --port 8000
```
Runs at `ws://localhost:8000`

### Frontend
```bash
cd frontend
npm run dev
```
Runs at `http://localhost:5173`

---

## Translation Flows

### Flow 1 — Deaf signs → Hearing hears (gesture → voice)
```
[Deaf user camera]
    → MediaPipe Hands detects hand presence + motion
    → Video frame captured (JPEG, base64)
    → WS message: { type: "sign_frame", frame_b64 }
    → Backend (flow3.py): Claude Vision identifies ASL sign → tokens e.g. ["HELP", "ME"]
    → Backend (flow1.py): Claude Haiku converts tokens to natural English sentence
    → gTTS generates MP3 audio
    → WS broadcast: { type: "tts_audio", audio_b64 }
    → Hearing user's browser plays audio
```

### Flow 2 — Hearing speaks → Deaf sees ASL (speech → sign images)
```
[Hearing user microphone]
    → Voice Activity Detection (RMS-based) filters silence
    → 2-second WAV chunks encoded as base64
    → WS message: { type: "audio_chunk", chunk_b64 }
    → Backend (flow2.py): Whisper (tiny model, local) transcribes audio → English text
    → Claude Haiku converts English → ASL gloss tokens e.g. ["STORE", "I", "GO"]
    → WS broadcast: { type: "asl_gloss", tokens }
    → Deaf user's browser shows ASL fingerspelling GIFs letter-by-letter
```

---

## WebSocket Message Reference

All messages are JSON. Server is at `ws://localhost:8000/ws/{room_id}`.

### Client → Server

| type | fields | description |
|------|--------|-------------|
| `join` | `room, role, name` | Announce joining a room |
| `peer_info` | `room, name, role` | Broadcast own identity to peers |
| `offer` | `room, sdp` | WebRTC offer (relayed to peers) |
| `answer` | `room, sdp` | WebRTC answer (relayed to peers) |
| `ice` | `room, candidate` | ICE candidate (relayed to peers) |
| `gloss` | `room, tokens[]` | ASL gloss tokens from gesture loop (legacy stub — replaced by sign_frame) |
| `sign_frame` | `room, frame_b64` | JPEG video frame for Claude Vision sign recognition |
| `audio_chunk` | `room, chunk_b64` | Base64 WAV audio chunk for Whisper transcription |
| `chat` | `room, sender, text, ts` | Chat message (relayed to peers) |
| `raise_hand` | `room, raised` | Hand raise toggle (relayed to peers) |
| `reaction` | `room, emoji` | Emoji reaction (relayed to peers) |

### Server → Client

| type | fields | who receives | description |
|------|--------|--------------|-------------|
| `joined` | `room, peerId, name, role` | everyone except sender | New peer joined |
| `peer_info` | `room, name, role` | everyone except sender | Peer identity info |
| `offer` | `sdp` | everyone except sender | WebRTC offer relay |
| `answer` | `sdp` | everyone except sender | WebRTC answer relay |
| `ice` | `candidate` | everyone except sender | ICE candidate relay |
| `tts_audio` | `audio_b64, room` | everyone except sender | MP3 audio of translated sign |
| `asl_gloss` | `tokens[], room` | everyone except sender | ASL gloss tokens from speech |
| `chat` | `sender, text, ts` | everyone except sender | Chat message relay |
| `raise_hand` | `raised` | everyone except sender | Hand raise relay |
| `reaction` | `emoji` | everyone except sender | Reaction relay |

---

## Key Frontend Files

### `socket.js`
Singleton WebSocket client. Queues messages sent before connection is open (fixes race condition on join). Key exports: `connect(roomId)`, `send(obj)`, `onMessage(handler)`, `disconnect()`.

### `webrtc.js`
Wraps `RTCPeerConnection`. Uses Google STUN server. Deaf user always creates the offer. Key exports: `init()`, `createOffer()`, `handleOffer()`, `handleAnswer()`, `addIce()`, `replaceVideoTrack()`, `close()`.

### `gestureDetector.js`
Uses `@mediapipe/tasks-vision` GestureRecognizer. Loads model from Google CDN on first use (~20MB download). Runs on a hidden `<video>` element fed by the local camera stream. Captures JPEG frames when hands are detected and stable. Key exports: `initGestureDetector()`, `detectGesture(videoEl)`.

**Note:** The MediaPipe built-in gesture labels (Open_Palm, Thumb_Up, etc.) are only used as a fallback. The primary path is frame → Claude Vision (flow3).

### `aslRenderer.js`
Fingerspells each gloss token letter-by-letter using static GIF images from `/public/asl/`. Shows each letter for 800ms with a 400ms gap between words. Key exports: `play(tokens[])`, `setImageCallback(fn)`.

### `audioPlayer.js`
Decodes base64 MP3 and plays it via the Web Audio API.

### `CallRoom.jsx`
Main component. Orchestrates everything:
- **Deaf role**: runs gesture loop → sends `sign_frame` → receives `tts_audio` → plays audio
- **Hearing role**: runs mic capture with VAD → sends `audio_chunk` → receives `asl_gloss` → shows sign images
- Handles WebRTC signaling, participant gallery, chat, reactions, hand raise, screen share
- `gesturePausedRef` — ref (not state) used inside rAF loop to pause sign sending without stale closure

### Participant name exchange flow
1. User A joins room (no one else) — sends `join`
2. User B joins — sends `join` → backend broadcasts `joined {name, role}` to A
3. A receives `joined` → stores B's name/role → sends back `peer_info {name, role}`
4. B receives `peer_info` → stores A's name/role
5. Both participant cards now show in the strip

---

## Key Backend Files

### `main.py`
FastAPI app. Single WebSocket endpoint `/ws/{room_id}`. Routes all message types. Spawns async tasks for Flow 1, 2, 3 processing.

### `room_manager.py`
`RoomManager` singleton. Tracks `{room_id: [WebSocket, ...]}`. Methods: `join`, `leave`, `broadcast(exclude=ws)`.

### `flow1.py`
`process_gloss(tokens[]) → audio_b64`
- Claude Haiku: tokens → natural English sentence
- gTTS: sentence → MP3 → base64

### `flow2.py`
`process_audio_chunk(audio_b64) → tokens[]`
- Decodes base64 WAV → temp file
- Whisper `tiny` model (local, CPU): transcribes → English text
- Claude Haiku: English → ASL gloss tokens

### `flow3.py`
`recognize_sign(frame_b64) → tokens[]`
- Claude Haiku Vision: JPEG frame → identifies ASL sign → English word(s)
- Returns empty list if sign is unclear or hands at rest

---

## Environment Variables

Backend requires a `.env` file at `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Dependencies

### Backend (`requirements.txt`)
- `fastapi` + `uvicorn` — WebSocket server
- `anthropic` — Claude API (flows 1, 2, 3)
- `openai-whisper` — local speech-to-text (flow 2)
- `gtts` — text-to-speech (flow 1)
- `python-dotenv` — env file loading

**Install note:** `openai-whisper` requires `setuptools<71` on Python 3.14 due to a `pkg_resources` compatibility issue. Run:
```bash
pip install "setuptools<71"
pip install openai-whisper --no-build-isolation
```

### Frontend (`package.json`)
- `react` + `react-dom` + `react-router-dom`
- `@mediapipe/tasks-vision` — hand gesture detection
- `vite` + `tailwindcss` — build + styling

---

## Known Limitations / TODO

- WebRTC is peer-to-peer (2 users max). For group calls, a media server (e.g. mediasoup) is needed.
- Whisper runs on CPU — ~2-4s transcription latency. GPU or a cloud STT would reduce this.
- ASL fingerspelling GIFs cover A-Z only. Numbers and common word signs are not yet included.
- `flow3.py` (Claude Vision sign recognition) backend handler in `main.py` is not yet wired up — needs `sign_frame` message type added to the router and `handle_flow3` async function.
- VAD threshold (`0.012` RMS) may need tuning per environment.
