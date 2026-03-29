let setImageFn = null

export function setImageCallback(fn) {
  setImageFn = fn
}

const LETTER_DURATION_MS = 800  // how long each letter shows
const WORD_GAP_MS = 400         // pause between words

export async function play(tokens) {
  if (!setImageFn || !tokens?.length) return

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].toUpperCase().replace(/[^A-Z]/g, '')
    for (const char of word) {
      setImageFn(`/asl/${char.toLowerCase()}.gif`)
      await sleep(LETTER_DURATION_MS)
    }
    // Gap between words
    if (i < tokens.length - 1) {
      setImageFn(null)
      await sleep(WORD_GAP_MS)
    }
  }

  setImageFn(null)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
