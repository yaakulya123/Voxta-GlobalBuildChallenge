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

let recognizer: GestureRecognizer | null = null;
let lastGesture: string | null = null;
let lastGestureTime = 0;

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
    if (!results.gestures?.length) return [];

    const top = results.gestures[0][0];
    if (!top || top.score < MIN_SCORE || top.categoryName === 'None') return [];

    const name = top.categoryName;
    const now = Date.now();
    
    // Debounce to prevent spamming the same sign 30 times a second
    if (name === lastGesture && now - lastGestureTime < DEBOUNCE_MS) return [];

    lastGesture = name;
    lastGestureTime = now;
    
    console.log(`[Gesture] detected: ${name} (${(top.score * 100).toFixed(0)}%)`);
    return GESTURE_MAP[name] ?? [];
  } catch {
    return [];
  }
}
