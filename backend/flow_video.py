"""Flow Video: sequence of frames → Gemini Vision → ASL gloss tokens
Used for complex signs that require motion context across multiple frames."""

import asyncio
import json
import os
import requests

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Gemini 2.5 Pro has significantly better vision/spatial reasoning for ASL
MODEL = "google/gemini-2.5-pro-preview"

CLIP_PROMPT = """You are an expert ASL (American Sign Language) interpreter.

Look at these video frames in order and identify the ASL hand sign(s) being performed.

Respond ONLY with the English word(s) in ALL CAPS (1-6 words max).
If you cannot identify a sign, respond exactly: UNCLEAR

Examples: HELLO, THANK YOU, I LOVE YOU, GOOD MORNING, HELP ME, MY NAME"""

SINGLE_PROMPT = """You are an expert ASL (American Sign Language) interpreter.

Look at this image and identify the ASL hand sign being made.

Respond ONLY with the English word in ALL CAPS (1-3 words max).
If you cannot identify a sign, respond exactly: UNCLEAR

Examples: HELLO, THANK YOU, GOOD, STOP, HELP, WATER"""

MAX_FRAMES = 8  # more frames = better motion context for 2.5 Pro


def _post(payload: dict) -> requests.Response:
    return requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "http://localhost:5174",
            "X-Title": "Voxta",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=30,
    )


def _call_batch(frames: list[str]) -> str:
    """Send all frames in one request for motion-aware recognition."""
    content = [{"type": "text", "text": CLIP_PROMPT}]
    for frame_b64 in frames:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}
        })

    resp = _post({
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 60,
    })

    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json()["choices"][0]["message"]["content"].strip().upper()


def _call_single(frame_b64: str) -> str:
    """Send a single frame — simpler, more reliable fallback."""
    resp = _post({
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": SINGLE_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}}
            ]
        }],
        "max_tokens": 30,
    })

    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json()["choices"][0]["message"]["content"].strip().upper()


def _is_unclear(result: str) -> bool:
    return not result or "UNCLEAR" in result or len(result) > 60


def _run(frames: list[str]) -> list[str]:
    """Blocking logic — runs in a thread executor."""

    # Subsample to MAX_FRAMES evenly
    if len(frames) > MAX_FRAMES:
        step = len(frames) / MAX_FRAMES
        frames = [frames[int(i * step)] for i in range(MAX_FRAMES)]

    print(f"[FlowVideo] Sending {len(frames)} frames to Gemini...")

    # Strategy 1: batch request (motion-aware)
    try:
        result = _call_batch(frames)
        print(f"[FlowVideo] Batch result: {result!r}")
        if not _is_unclear(result):
            return [t.strip() for t in result.split() if t.strip()]
    except Exception as e:
        print(f"[FlowVideo] Batch failed: {e}")

    # Strategy 2: try each frame individually, return first clear result
    print("[FlowVideo] Falling back to per-frame analysis...")
    for i, frame in enumerate(frames):
        try:
            result = _call_single(frame)
            print(f"[FlowVideo] Frame {i} result: {result!r}")
            if not _is_unclear(result):
                return [t.strip() for t in result.split() if t.strip()]
        except Exception as e:
            print(f"[FlowVideo] Frame {i} error: {e}")

    print("[FlowVideo] All frames returned UNCLEAR")
    return []


async def recognize_sign_from_clip(frames: list[str]) -> list[str]:
    """Entry point — runs blocking HTTP calls in a thread."""
    if not frames:
        print("[FlowVideo] No frames received")
        return []

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run, frames)
