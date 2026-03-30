import { HandLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * ASL Detector — uses MediaPipe HandLandmarker for:
 *   1. Real-time finger-state ASL classification (letters + common signs)
 *   2. Raw landmark capture for the clip-recording pipeline
 *   3. Hold-to-record trigger (closed fist 2s)
 */

// ── Landmark indices ──
const WRIST = 0;
const THUMB_CMC = 1, THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4;
const INDEX_MCP = 5, INDEX_PIP = 6, INDEX_DIP = 7, INDEX_TIP = 8;
const MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_DIP = 11, MIDDLE_TIP = 12;
const RING_MCP = 13, RING_PIP = 14, RING_DIP = 15, RING_TIP = 16;
const PINKY_MCP = 17, PINKY_PIP = 18, PINKY_DIP = 19, PINKY_TIP = 20;

// ── Config ──
const DEBOUNCE_MS = 1200;
const CONFIDENCE_FRAMES = 3;      // consecutive same detections required
const HOLD_TRIGGER_MS = 2000;     // hold fist 2s to trigger recording
const WORD_TIMEOUT_MS = 2500;     // flush letter buffer after this gap

export type Landmark = { x: number; y: number; z: number };

let landmarker: HandLandmarker | null = null;

// Real-time detection state
let lastSign: string | null = null;
let lastSignTime = 0;
let consecutiveCount = 0;
let lastDetected = '';

// Letter buffering for fingerspelling
let letterBuffer: string[] = [];
let lastLetterTime = 0;

// Hold-to-record state
let holdActive = false;
let holdStart = 0;
let holdFired = false;
let recordTriggerCallback: (() => void) | null = null;

// Landmark capture for recording pipeline
let lastLandmarks: Landmark[] | null = null;

// ── Init ──

export async function initGestureDetector() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    console.log('[ASL] HandLandmarker initialized');
  } catch (error) {
    console.error('[ASL] Failed to initialize HandLandmarker', error);
  }
}

// ── Recording pipeline helpers (kept from friend's code) ──

export function captureLandmarks(): Landmark[] | null {
  return lastLandmarks;
}

export function setRecordTriggerCallback(cb: () => void) {
  recordTriggerCallback = cb;
}

// ── Finger-state helpers ──

function isFingerExtended(
  lm: NormalizedLandmark[], pip: number, tip: number, mcp: number
): boolean {
  return lm[tip].y < lm[pip].y && lm[tip].y < lm[mcp].y;
}

function isFingerCurled(
  lm: NormalizedLandmark[], pip: number, tip: number, mcp: number
): boolean {
  return lm[tip].y > lm[pip].y || lm[tip].y > lm[mcp].y;
}

function isThumbExtended(lm: NormalizedLandmark[]): boolean {
  return Math.abs(lm[THUMB_TIP].x - lm[WRIST].x) > Math.abs(lm[THUMB_MCP].x - lm[WRIST].x);
}

function isThumbUp(lm: NormalizedLandmark[]): boolean {
  return lm[THUMB_TIP].y < lm[THUMB_IP].y && lm[THUMB_TIP].y < lm[INDEX_MCP].y;
}

function isThumbAcrossPalm(lm: NormalizedLandmark[]): boolean {
  const thumbTipX = lm[THUMB_TIP].x;
  const indexMcpX = lm[INDEX_MCP].x;
  const middleMcpX = lm[MIDDLE_MCP].x;
  return Math.abs(thumbTipX - middleMcpX) < Math.abs(indexMcpX - middleMcpX) * 0.7;
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function fingertipsTouchThumb(lm: NormalizedLandmark[], tips: number[]): boolean {
  return tips.every(t => dist(lm[t], lm[THUMB_TIP]) < 0.07);
}

function getFingerStates(lm: NormalizedLandmark[]) {
  return {
    index:  isFingerExtended(lm, INDEX_PIP, INDEX_TIP, INDEX_MCP),
    middle: isFingerExtended(lm, MIDDLE_PIP, MIDDLE_TIP, MIDDLE_MCP),
    ring:   isFingerExtended(lm, RING_PIP, RING_TIP, RING_MCP),
    pinky:  isFingerExtended(lm, PINKY_PIP, PINKY_TIP, PINKY_MCP),
    thumb:  isThumbExtended(lm),
    thumbUp: isThumbUp(lm),
    indexCurled:  isFingerCurled(lm, INDEX_PIP, INDEX_TIP, INDEX_MCP),
    middleCurled: isFingerCurled(lm, MIDDLE_PIP, MIDDLE_TIP, MIDDLE_MCP),
    ringCurled:   isFingerCurled(lm, RING_PIP, RING_TIP, RING_MCP),
    pinkyCurled:  isFingerCurled(lm, PINKY_PIP, PINKY_TIP, PINKY_MCP),
  };
}

// ── ASL Classification ──

function classifyASL(lm: NormalizedLandmark[]): string | null {
  const s = getFingerStates(lm);
  const allUp = s.index && s.middle && s.ring && s.pinky;
  const allCurled = s.indexCurled && s.middleCurled && s.ringCurled && s.pinkyCurled;

  // ── Common signs (words) — check first as they're most useful ──

  // ILY (I Love You): thumb + index + pinky extended, middle + ring curled
  if (s.thumb && s.index && s.pinky && s.middleCurled && s.ringCurled) {
    return 'I LOVE YOU';
  }

  // Y: thumb + pinky out, others curled (hang loose) — NOT ILY because no index
  if (s.thumb && s.pinky && s.indexCurled && s.middleCurled && s.ringCurled) {
    return 'Y';
  }

  // THUMBS UP = GOOD
  if (s.thumbUp && allCurled) {
    return 'GOOD';
  }

  // L: index up + thumb out to side, others curled
  if (s.index && s.thumb && s.middleCurled && s.ringCurled && s.pinkyCurled) {
    const thumbAngle = Math.abs(lm[THUMB_TIP].x - lm[INDEX_TIP].x);
    if (thumbAngle > 0.06) return 'L';
  }

  // D: only index up, others curled (pointing up)
  if (s.index && s.middleCurled && s.ringCurled && s.pinkyCurled && !s.thumb) {
    return 'D';
  }

  // I: only pinky up
  if (s.pinky && s.indexCurled && s.middleCurled && s.ringCurled && !s.thumb) {
    return 'I';
  }

  // V / K / U: index + middle up, others down
  if (s.index && s.middle && s.ringCurled && s.pinkyCurled) {
    const spread = Math.abs(lm[INDEX_TIP].x - lm[MIDDLE_TIP].x);
    if (spread > 0.04) {
      // Spread fingers
      const thumbY = lm[THUMB_TIP].y;
      const indexBaseY = lm[INDEX_PIP].y;
      if (thumbY < indexBaseY) return 'K';
      return 'V';
    }
    // Fingers together
    if (Math.abs(lm[INDEX_TIP].x - lm[MIDDLE_TIP].x) < 0.02) return 'R'; // crossed
    return 'U';
  }

  // W: index + middle + ring up, pinky curled
  if (s.index && s.middle && s.ring && s.pinkyCurled) {
    return 'W';
  }

  // B / HELLO: all fingers up
  if (allUp) {
    const spread = Math.abs(lm[INDEX_TIP].x - lm[PINKY_TIP].x);
    if (spread > 0.12 && s.thumb) return 'HELLO';
    if (isThumbAcrossPalm(lm)) return 'B';
    return 'HELLO';
  }

  // F: middle + ring + pinky up, index + thumb touch
  if (s.middle && s.ring && s.pinky && !s.index) {
    if (dist(lm[INDEX_TIP], lm[THUMB_TIP]) < 0.06) return 'F';
  }

  // O: all fingertips touch thumb
  if (fingertipsTouchThumb(lm, [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP])) {
    return 'O';
  }

  // C: curved hand
  if (!allUp && !allCurled) {
    const thumbDist = dist(lm[THUMB_TIP], lm[INDEX_TIP]);
    const indexAngle = lm[INDEX_TIP].y - lm[INDEX_MCP].y;
    if (thumbDist > 0.08 && thumbDist < 0.18 && indexAngle < 0 && indexAngle > -0.15) {
      return 'C';
    }
  }

  // A: fist with thumb on side
  if (allCurled && s.thumb && !isThumbAcrossPalm(lm)) {
    return 'A';
  }

  // S: fist with thumb across
  if (allCurled && isThumbAcrossPalm(lm)) {
    return 'S';
  }

  // E: all curled, thumb across (similar to S but fingers more curved down)
  if (allCurled && !s.thumb) {
    return 'S';
  }

  return null;
}

// ── Fist detection for hold-to-record ──

function isFist(lm: NormalizedLandmark[]): boolean {
  const s = getFingerStates(lm);
  return s.indexCurled && s.middleCurled && s.ringCurled && s.pinkyCurled;
}

// ── Main detection function ──

export function detectGesture(videoEl: HTMLVideoElement): string[] {
  if (!landmarker || !videoEl || videoEl.readyState < 2) return [];

  try {
    const results = landmarker.detectForVideo(videoEl, performance.now());

    // Update landmarks for recording pipeline
    lastLandmarks = results.landmarks?.length
      ? results.landmarks[0].map(pt => ({ x: pt.x, y: pt.y, z: pt.z }))
      : null;

    if (!results.landmarks?.length) {
      consecutiveCount = 0;
      lastDetected = '';
      holdActive = false;
      holdFired = false;
      return [];
    }

    const landmarks = results.landmarks[0];
    const now = Date.now();

    // ── Hold-to-record detection ──
    if (isFist(landmarks)) {
      if (!holdActive) {
        holdActive = true;
        holdStart = now;
        holdFired = false;
      } else if (!holdFired && now - holdStart >= HOLD_TRIGGER_MS) {
        holdFired = true;
        console.log('[ASL] Record trigger: fist held 2s');
        recordTriggerCallback?.();
        return [];
      }
      if (holdFired) return [];
      // Don't classify as sign while potentially holding for record
      if (now - holdStart > 500) return [];
    } else {
      holdActive = false;
      holdFired = false;
    }

    // ── Real-time ASL classification ──
    const sign = classifyASL(landmarks);

    if (!sign) {
      consecutiveCount = 0;
      lastDetected = '';
      return [];
    }

    // Require consecutive consistent detections
    if (sign === lastDetected) {
      consecutiveCount++;
    } else {
      lastDetected = sign;
      consecutiveCount = 1;
    }

    if (consecutiveCount < CONFIDENCE_FRAMES) return [];

    // Debounce same sign
    if (sign === lastSign && now - lastSignTime < DEBOUNCE_MS) return [];

    lastSign = sign;
    lastSignTime = now;

    console.log(`[ASL] Detected: ${sign}`);

    // Multi-char = word sign, emit directly
    if (sign.length > 1) {
      const buffered = flushLetterBuffer();
      return buffered.length > 0 ? [...buffered, sign] : [sign];
    }

    // Single letter → accumulate
    letterBuffer.push(sign);
    lastLetterTime = now;
    return [];
  } catch {
    return [];
  }
}

/** Flush accumulated letters as a spelled word */
export function flushLetterBuffer(): string[] {
  if (letterBuffer.length === 0) return [];
  const now = Date.now();
  if (now - lastLetterTime > WORD_TIMEOUT_MS) {
    const word = letterBuffer.join('');
    letterBuffer = [];
    console.log(`[ASL] Spelled word: ${word}`);
    return [word];
  }
  return [];
}

/** Get current buffer for live display */
export function getLetterBuffer(): string {
  return letterBuffer.join('');
}
