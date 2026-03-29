import { ASL_LOCAL_WORDS } from './aslLocalWords';

/**
 * ASL sign lookup — uses locally downloaded GIFs/MP4s first (fast, works offline),
 * then falls back to Lifeprint.com remote URLs.
 *
 * The component handles 404s gracefully by fingerspelling the word instead.
 *
 * OVERRIDES: words whose Lifeprint URL differs from the standard pattern.
 */
const OVERRIDES: Record<string, string> = {
  'thank you':    'https://www.lifeprint.com/asl101/gifs/t/thank-you.gif',
  'i love you':   'https://www.lifeprint.com/asl101/gifs/i/i-love-you.gif',
  'good morning': 'https://www.lifeprint.com/asl101/gifs/g/good-morning.gif',
  'good night':   'https://www.lifeprint.com/asl101/gifs/g/good-night.gif',
  'nice to meet': 'https://www.lifeprint.com/asl101/gifs/n/nice-to-meet-you.gif',
  "i'm":          'https://www.lifeprint.com/asl101/gifs/i/i.gif',
  "don't":        'https://www.lifeprint.com/asl101/gifs/d/dont.gif',
  "can't":        'https://www.lifeprint.com/asl101/gifs/c/cant.gif',
  "won't":        'https://www.lifeprint.com/asl101/gifs/w/wont.gif',
};

/**
 * Returns a Lifeprint GIF URL to try for any word.
 * The caller should handle 404 (onError) by falling back to fingerspelling.
 */
export function getSignUrl(word: string): string {
  const w = word.toLowerCase().trim();
  if (OVERRIDES[w]) return OVERRIDES[w];
  // Prefer locally downloaded file (works offline, no CORS)
  if (ASL_LOCAL_WORDS[w]) return ASL_LOCAL_WORDS[w];
  const first = w[0];
  if (!first || !/[a-z]/.test(first)) return '';
  return `https://www.lifeprint.com/asl101/gifs/${first}/${w}.gif`;
}

export type SignToken =
  | { type: 'sign';  word: string; url: string }
  | { type: 'spell'; word: string; letters: string[] };

export function tokenizeSentence(sentence: string): SignToken[] {
  const words = sentence.trim().split(/\s+/);
  return words
    .map((raw) => {
      const word = raw.replace(/[^a-zA-Z']/g, '').toLowerCase();
      if (!word) return null;
      const url = getSignUrl(word);
      if (url) {
        return { type: 'sign', word, url } as SignToken;
      }
      // Non-alpha word — fingerspell
      const letters = word.split('').filter(c => /[a-z]/.test(c));
      return { type: 'spell', word, letters } as SignToken;
    })
    .filter(Boolean) as SignToken[];
}
