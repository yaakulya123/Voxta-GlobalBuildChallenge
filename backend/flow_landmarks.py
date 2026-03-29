"""Flow Landmarks: MediaPipe hand landmark sequence → ASL recognition via text LLM.

Landmark indices (MediaPipe hand):
  0=WRIST  1=THUMB_CMC  2=THUMB_MCP  3=THUMB_IP  4=THUMB_TIP
  5=INDEX_MCP  6=INDEX_PIP  7=INDEX_DIP  8=INDEX_TIP
  9=MIDDLE_MCP  10=MIDDLE_PIP  11=MIDDLE_DIP  12=MIDDLE_TIP
  13=RING_MCP  14=RING_PIP  15=RING_DIP  16=RING_TIP
  17=PINKY_MCP  18=PINKY_PIP  19=PINKY_DIP  20=PINKY_TIP

Coordinate system: x=0 left→1 right, y=0 top→1 bottom, z=depth (negative=closer)
"""

import asyncio
import json
import math
import os
import requests
from flow_rules import classify_landmarks

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# GPT-4o is excellent at structured spatial/motion reasoning from text data
MODEL = "openai/gpt-4o"

# Key landmark indices
WRIST      = 0
THUMB_TIP  = 4
INDEX_MCP  = 5
INDEX_TIP  = 8
MIDDLE_MCP = 9
MIDDLE_TIP = 12
RING_MCP   = 13
RING_TIP   = 16
PINKY_MCP  = 17
PINKY_TIP  = 20


def _finger_extended(frame: list, tip_idx: int, mcp_idx: int) -> bool:
    """True if fingertip is above its MCP joint (lower y = higher in image)."""
    return frame[tip_idx]["y"] < frame[mcp_idx]["y"] - 0.02


def _hand_shape(frame: list) -> str:
    index  = _finger_extended(frame, INDEX_TIP,  INDEX_MCP)
    middle = _finger_extended(frame, MIDDLE_TIP, MIDDLE_MCP)
    ring   = _finger_extended(frame, RING_TIP,   RING_MCP)
    pinky  = _finger_extended(frame, PINKY_TIP,  PINKY_MCP)
    count  = sum([index, middle, ring, pinky])
    if count == 0:
        return "closed-fist"
    if count == 4:
        return "open-palm"
    if index and middle and not ring and not pinky:
        return "V/peace"
    if index and not middle and not ring and not pinky:
        return "pointing"
    return f"partial({count}/4 fingers extended)"


def _body_zone(y: float) -> str:
    if y < 0.25:
        return "forehead/top-of-head"
    if y < 0.40:
        return "face/chin"
    if y < 0.58:
        return "neck/upper-chest"
    if y < 0.72:
        return "chest"
    return "stomach/lower"


def format_landmarks(frames: list) -> str:
    n = len(frames)
    fps = 5  # ~200ms per frame
    duration = n / fps

    lines = [
        f"Hand landmark motion sequence: {n} frames over ~{duration:.1f}s (captured at {fps} fps).",
        "x=0 is left, x=1 is right; y=0 is top, y=1 is bottom of camera frame.",
        "",
    ]

    # Subsample to at most 10 keyframes for the prompt
    step = max(1, n // 10)
    keyframes = [(i, frames[i]) for i in range(0, n, step)][:10]

    for seq_i, (i, frame) in enumerate(keyframes):
        w  = frame[WRIST]
        tt = frame[THUMB_TIP]
        it = frame[INDEX_TIP]
        mt = frame[MIDDLE_TIP]
        pt = frame[PINKY_TIP]

        def rel(tip: dict) -> str:
            dx = tip["x"] - w["x"]
            dy = tip["y"] - w["y"]
            return f"({dx:+.2f},{dy:+.2f})"

        shape = _hand_shape(frame)
        zone  = _body_zone(w["y"])

        lines.append(
            f"t={i/fps:.1f}s: wrist=({w['x']:.2f},{w['y']:.2f}) [{zone}] | "
            f"shape={shape} | "
            f"thumb={rel(tt)} index={rel(it)} middle={rel(mt)} pinky={rel(pt)}"
        )

    # ── Motion analysis ───────────────────────────────────────────────────
    first_w = frames[0][WRIST]
    last_w  = frames[-1][WRIST]
    mid_w   = frames[n // 2][WRIST]

    dx_total = last_w["x"] - first_w["x"]
    dy_total = last_w["y"] - first_w["y"]
    dist     = math.hypot(dx_total, dy_total)

    # Check for circular motion: midpoint deviates significantly from straight line
    mid_exp_x = (first_w["x"] + last_w["x"]) / 2
    mid_exp_y = (first_w["y"] + last_w["y"]) / 2
    circ_dev  = math.hypot(mid_w["x"] - mid_exp_x, mid_w["y"] - mid_exp_y)
    is_circular = circ_dev > 0.04 and dist < 0.15

    # Wrist speed variance (consistent vs jerky)
    speeds = []
    for i in range(1, len(frames)):
        pw = frames[i - 1][WRIST]
        cw = frames[i][WRIST]
        speeds.append(math.hypot(cw["x"] - pw["x"], cw["y"] - pw["y"]))
    avg_speed = sum(speeds) / len(speeds) if speeds else 0

    lines.append("")
    lines.append("=== MOTION SUMMARY ===")
    lines.append(f"Total wrist displacement: ({dx_total:+.2f}, {dy_total:+.2f}), distance={dist:.3f}")
    lines.append(f"Avg speed per frame: {avg_speed:.3f}")

    if dist < 0.04:
        lines.append("Pattern: STATIC sign (hand barely moves)")
    elif is_circular:
        lines.append(f"Pattern: CIRCULAR motion (mid-trajectory deviation={circ_dev:.3f})")
    elif abs(dx_total) > abs(dy_total) * 1.5:
        lines.append(f"Pattern: HORIZONTAL sweep ({'→ right' if dx_total > 0 else '← left'})")
    elif abs(dy_total) > abs(dx_total) * 1.5:
        lines.append(f"Pattern: VERTICAL sweep ({'↓ down' if dy_total > 0 else '↑ up'})")
    else:
        lines.append("Pattern: DIAGONAL or COMPLEX motion")

    avg_y = sum(f[WRIST]["y"] for f in frames) / n
    lines.append(f"Average hand height: y={avg_y:.2f} ({_body_zone(avg_y)})")

    dominant_shape = _hand_shape(frames[n // 2])
    lines.append(f"Dominant hand shape (mid-clip): {dominant_shape}")

    return "\n".join(lines)


LANDMARK_PROMPT = """You are an expert ASL (American Sign Language) interpreter.
Below is structured motion data from MediaPipe hand landmark tracking during a signing clip.
Use the trajectory, hand shape, body position, and movement pattern to identify the ASL sign.

Key ASL motion patterns for reference:
- SORRY: closed-fist, circular motion at chest level
- PLEASE: open-palm, circular motion at chest level (similar to sorry but open hand)
- THANK YOU: open/flat hand starts at face/chin, sweeps forward-down
- HELLO / HI: open-palm at forehead, sweeps outward to the side
- HELP: one fist (thumb up) placed on other open palm, lifts upward
- YES: closed-fist, vertical nodding/bouncing motion
- NO: index+middle finger snap closed toward thumb, slight side-to-side
- STOP: open hand chops horizontally onto other palm (sudden halt)
- WATER: W-shaped hand (3 fingers) taps chin area
- EAT / FOOD: fingers bunched, taps toward mouth repeatedly
- DRINK: curved hand (like holding cup) tips toward mouth
- LOVE: both crossed fists pressed to chest, static
- WANT: both hands open, pull toward body
- NAME: two H-hands (index+middle horizontal) tap together
- GOOD: open hand at chin, swings forward-down
- BAD: open hand at chin, swings down and flips
- MORE: both hands bunched, fingertips tap together
- I / ME: index finger points to chest
- YOU: index finger points outward
- WE: index finger sweeps from one shoulder to other
- WHAT: both hands open, wiggle fingers
- WHERE: index finger waggles side to side
- WHEN: index finger circles around other index
- HOW: curved hands roll forward
- FRIEND: index fingers hook and swap
- UNDERSTAND: index at forehead, flicks up
- KNOW: flat hand taps forehead
- THINK: index circles at temple
- WAIT: spread fingers wiggle in place, hand tilted

{data}

What ASL sign is being performed?
Respond ONLY with the English word(s) in ALL CAPS (1-4 words max).
If you cannot determine with reasonable confidence: UNCLEAR"""


def _call_llm(landmark_text: str) -> str:
    prompt = LANDMARK_PROMPT.format(data=landmark_text)
    resp = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "http://localhost:5174",
            "X-Title": "Voxta",
            "Content-Type": "application/json",
        },
        data=json.dumps({
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 40,
            "temperature": 0.1,  # low temp for deterministic spatial reasoning
        }),
        timeout=20,
    )
    if not resp.ok:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"].strip().upper()


def _run(frames: list) -> list[str]:
    print(f"[FlowLandmarks] Processing {len(frames)} landmark frames...")

    # ── Pass 1: deterministic rule-based classifier (instant, no API) ────────
    rule_result = classify_landmarks(frames)
    if rule_result:
        print(f"[FlowLandmarks] Rule-based result: {rule_result}")
        return [t.strip() for t in rule_result.split() if t.strip()]

    # ── Pass 2: LLM fallback for unknown signs ────────────────────────────────
    landmark_text = format_landmarks(frames)
    print(f"[FlowLandmarks] LLM fallback with description:\n{landmark_text}\n")

    result = _call_llm(landmark_text)
    print(f"[FlowLandmarks] LLM result: {result!r}")

    if not result or "UNCLEAR" in result or len(result) > 60:
        print("[FlowLandmarks] Unclear result")
        return []

    return [t.strip() for t in result.split() if t.strip()]


async def recognize_from_landmarks(frames: list) -> list[str]:
    """Entry point — runs blocking HTTP call in a thread."""
    if not frames:
        print("[FlowLandmarks] No landmark frames received")
        return []
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run, frames)
