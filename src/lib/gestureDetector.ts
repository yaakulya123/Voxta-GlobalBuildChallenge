import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

// Hardcoded logic to map recognized hand poses into word translations
const GESTURE_MAP: Record<string, string[]> = {
  Open_Palm:   ['HELLO'],
  Thumb_Up:    ['GOOD'],
  Thumb_Down:  ['BAD'],
  Victory:     ['PEACE'],
  ILoveYou:    ['LOVE', 'YOU'],
  Pointing_Up: ['WAIT'],
  Closed_Fist: ['STOP'],
};

const DEBOUNCE_MS = 1500;
const MIN_SCORE   = 0.72;

// Holding Closed_Fist for 2s toggles recording instead of translating
const HOLD_GESTURE    = 'Closed_Fist';
const HOLD_TRIGGER_MS = 2000;

export type Landmark = { x: number; y: number; z: number };

let recognizer: GestureRecognizer | null = null;
let lastGesture: string | null = null;
let lastGestureTime = 0;
let lastLandmarks: Landmark[] | null = null;  // updated every detectGesture call

// Hold state
let holdActive  = false;
let holdStart   = 0;
let holdFired   = false;
let recordTriggerCallback: (() => void) | null = null;

/** Returns the 21 hand landmarks from the most recent MediaPipe frame, or null if no hand detected. */
export function captureLandmarks(): Landmark[] | null {
  return lastLandmarks;
}

export function setRecordTriggerCallback(cb: () => void) {
  recordTriggerCallback = cb;
}

export async function initGestureDetector() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    recognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    console.log('[Gesture] MediaPipe GestureRecognizer active');
  } catch (error) {
    console.error('[Gesture] Failed to initialize MediaPipe', error);
  }
}

export function detectGesture(videoEl: HTMLVideoElement): string[] {
  if (!recognizer || !videoEl || videoEl.readyState < 2) return [];

  try {
    const results = recognizer.recognizeForVideo(videoEl, performance.now());

    // Always update lastLandmarks so captureLandmarks() reflects current frame
    lastLandmarks = results.landmarks?.length
      ? results.landmarks[0].map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
      : null;

    if (!results.gestures?.length) {
      // Gesture dropped — reset hold state
      holdActive = false;
      holdFired  = false;
      return [];
    }

    const top = results.gestures[0][0];
    if (!top || top.score < MIN_SCORE || top.categoryName === 'None') {
      holdActive = false;
      holdFired  = false;
      return [];
    }

    const name = top.categoryName;
    const now  = Date.now();

    // ── Hold detection for record toggle ──────────────────────────────────
    if (name === HOLD_GESTURE) {
      if (!holdActive) {
        holdActive = true;
        holdStart  = now;
        holdFired  = false;
      } else if (!holdFired && now - holdStart >= HOLD_TRIGGER_MS) {
        holdFired = true;
        console.log('[Gesture] Record trigger: Closed_Fist held 2s');
        recordTriggerCallback?.();
        return []; // consume — don't also emit a translation
      }
      if (holdFired) return []; // still holding after trigger
    } else {
      holdActive = false;
      holdFired  = false;
    }
    // ──────────────────────────────────────────────────────────────────────

    // Debounce to prevent spamming the same sign 30 times a second
    if (name === lastGesture && now - lastGestureTime < DEBOUNCE_MS) return [];

    lastGesture     = name;
    lastGestureTime = now;

    console.log(`[Gesture] detected: ${name} (${(top.score * 100).toFixed(0)}%)`);
    return GESTURE_MAP[name] ?? [];
  } catch {
    return [];
  }
}
