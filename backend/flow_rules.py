"""Rule-based ASL classifier using MediaPipe hand landmark trajectories.

Runs locally with zero API calls. Returns a word in CAPS or None if no rule matches.
Falls back to LLM (flow_landmarks.py) only when None is returned.

Coordinate system (MediaPipe):
  x: 0=left edge → 1=right edge
  y: 0=top → 1=bottom  (IMPORTANT: lower y = higher in frame)
  z: depth (usually ignored for front-facing camera)

Landmark indices used:
  0=WRIST
  4=THUMB_TIP
  5=INDEX_MCP,  8=INDEX_TIP
  9=MIDDLE_MCP, 12=MIDDLE_TIP
  13=RING_MCP,  16=RING_TIP
  17=PINKY_MCP, 20=PINKY_TIP
"""

import math

# ── Landmark indices ──────────────────────────────────────────────────────────
WRIST      = 0
THUMB_TIP  = 4
INDEX_MCP  = 5;  INDEX_TIP  = 8
MIDDLE_MCP = 9;  MIDDLE_TIP = 12
RING_MCP   = 13; RING_TIP   = 16
PINKY_MCP  = 17; PINKY_TIP  = 20


# ── Low-level features ────────────────────────────────────────────────────────

def _extended(frame, tip, mcp, threshold=0.03) -> bool:
    """Finger is extended if tip is clearly above its MCP joint (lower y)."""
    return frame[tip]["y"] < frame[mcp]["y"] - threshold


def hand_shape(frame) -> str:
    idx    = _extended(frame, INDEX_TIP,  INDEX_MCP)
    mid    = _extended(frame, MIDDLE_TIP, MIDDLE_MCP)
    ring   = _extended(frame, RING_TIP,   RING_MCP)
    pinky  = _extended(frame, PINKY_TIP,  PINKY_MCP)
    thumb  = abs(frame[THUMB_TIP]["x"] - frame[WRIST]["x"]) > 0.08  # thumb out

    count = sum([idx, mid, ring, pinky])

    if count == 0 and not thumb:
        return "fist"
    if count == 0 and thumb:
        return "thumbs-up"
    if count == 4:
        return "open"
    if idx and mid and not ring and not pinky:
        return "V"
    if idx and not mid and not ring and not pinky:
        return "point"
    if idx and pinky and not mid and not ring:
        return "ILY"
    return f"partial-{count}"


def body_zone(avg_y: float) -> str:
    if avg_y < 0.28:  return "forehead"
    if avg_y < 0.42:  return "face"
    if avg_y < 0.55:  return "chin-neck"
    if avg_y < 0.70:  return "chest"
    return "stomach"


# ── Motion feature extraction ─────────────────────────────────────────────────

def extract_motion(frames: list) -> dict:
    n = len(frames)
    wrists = [f[WRIST] for f in frames]

    xs = [w["x"] for w in wrists]
    ys = [w["y"] for w in wrists]

    avg_x = sum(xs) / n
    avg_y = sum(ys) / n

    var_x = sum((x - avg_x) ** 2 for x in xs) / n
    var_y = sum((y - avg_y) ** 2 for y in ys) / n

    dx = wrists[-1]["x"] - wrists[0]["x"]
    dy = wrists[-1]["y"] - wrists[0]["y"]
    dist = math.hypot(dx, dy)

    # Circular: both axes vary significantly and net displacement is small
    is_circular = var_x > 0.0025 and var_y > 0.0015 and dist < 0.14

    # Vertical bounce: y direction changes sign ≥3 times (nodding)
    dy_seq = [ys[i+1] - ys[i] for i in range(n - 1)]
    sign_flips = sum(
        1 for i in range(len(dy_seq) - 1)
        if dy_seq[i] * dy_seq[i+1] < -0.00001
    )
    is_bouncing = sign_flips >= 3 and var_y > 0.0008

    # Horizontal sweep: large net x movement, small y movement
    is_horizontal = abs(dx) > 0.10 and abs(dy) < abs(dx) * 0.6

    return {
        "avg_x":       avg_x,
        "avg_y":       avg_y,
        "var_x":       var_x,
        "var_y":       var_y,
        "dx":          dx,
        "dy":          dy,
        "dist":        dist,
        "is_circular": is_circular,
        "is_bouncing": is_bouncing,
        "is_horizontal": is_horizontal,
        "is_stationary": dist < 0.05 and var_x < 0.0015 and var_y < 0.0015,
        "moved_up":    dy < -0.09,
        "moved_down":  dy > 0.09,
    }


# ── Rule table ────────────────────────────────────────────────────────────────
# Each entry: (sign_word, match_function)
# match_function(shape, motion, zone) → bool

def _rules():
    return [
        # ── Dynamic signs ──────────────────────────────────────────────────
        ("SORRY",     lambda s, m, z: s == "fist"  and m["is_circular"] and z in ("chest",)),
        ("PLEASE",    lambda s, m, z: s == "open"  and m["is_circular"] and z in ("chest",)),
        ("YES",       lambda s, m, z: s == "fist"  and m["is_bouncing"]),
        ("THANK YOU", lambda s, m, z: s == "open"  and z in ("face", "chin-neck") and m["moved_down"] and m["dist"] > 0.07),
        ("HELLO",     lambda s, m, z: s == "open"  and z in ("forehead", "face")  and m["is_horizontal"]),
        ("HELP",      lambda s, m, z: s == "fist"  and m["moved_up"] and z in ("chest", "chin-neck")),
        ("STOP",      lambda s, m, z: s == "open"  and m["moved_down"] and m["dist"] > 0.12),
        ("NO",        lambda s, m, z: s in ("point","V") and m["is_horizontal"] and z in ("face","chin-neck","chest")),
        ("MORE",      lambda s, m, z: "partial" in s and m["is_bouncing"]),
        # ── Static signs ───────────────────────────────────────────────────
        ("LOVE",      lambda s, m, z: s == "fist"  and m["is_stationary"] and z in ("chest",)),
        ("I LOVE YOU",lambda s, m, z: s == "ILY"   and m["is_stationary"]),
        ("GOOD",      lambda s, m, z: s == "open"  and z in ("face", "chin-neck") and m["is_stationary"]),
        ("THUMBS UP", lambda s, m, z: s == "thumbs-up" and m["is_stationary"]),
        ("WAIT",      lambda s, m, z: s == "open"  and m["is_bouncing"] and z in ("chest","chin-neck")),
        ("I",         lambda s, m, z: s == "point" and m["is_stationary"] and z in ("chest",)),
        ("YOU",       lambda s, m, z: s == "point" and m["is_stationary"] and z in ("chin-neck","face","chest") and abs(m["dx"]) < 0.05),
    ]


# ── Public entry point ────────────────────────────────────────────────────────

def classify_landmarks(frames: list) -> str | None:
    """
    Returns a sign word in CAPS if a rule matches, else None (→ fall through to LLM).
    """
    if len(frames) < 4:
        return None

    # Use middle frame for dominant hand shape
    mid_shape = hand_shape(frames[len(frames) // 2])

    motion = extract_motion(frames)
    zone   = body_zone(motion["avg_y"])

    print(
        f"[Rules] shape={mid_shape} zone={zone} "
        f"circular={motion['is_circular']} bounce={motion['is_bouncing']} "
        f"dx={motion['dx']:+.3f} dy={motion['dy']:+.3f} dist={motion['dist']:.3f}"
    )

    for word, match in _rules():
        if match(mid_shape, motion, zone):
            print(f"[Rules] ✓ matched: {word}")
            return word

    print("[Rules] no rule matched → falling back to LLM")
    return None
