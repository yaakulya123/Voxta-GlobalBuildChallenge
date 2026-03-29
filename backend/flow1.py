"""Flow 1: ASL gloss tokens → spoken sentence → audio (TTS via gTTS, free)"""

import anthropic
import base64
import os
import io
import asyncio
from gtts import gTTS

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

ASL_SYSTEM_PROMPT = """You convert ASL gloss tokens into natural spoken English sentences.

ASL gloss is NOT English. Rules:
- No articles (no "the", "a", "an")
- No "to be" verbs
- Topic-comment structure (object comes first)
- Base verb forms only

Your job: receive a list of ASL gloss tokens and output ONE natural English sentence a hearing person would say.
Output ONLY the sentence. No explanation, no punctuation beyond the sentence itself.

Examples:
Tokens: ["STORE", "I", "GO"] → "I'm going to the store"
Tokens: ["NAME", "WHAT", "YOU"] → "What's your name?"
Tokens: ["HELP", "PLEASE", "ME"] → "Please help me"
Tokens: ["THANK", "YOU"] → "Thank you"
"""


async def gloss_to_sentence(tokens: list[str]) -> str:
    token_str = " ".join(tokens)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        system=ASL_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Tokens: {token_str}"}],
    )
    return message.content[0].text.strip()


def _gtts_to_base64(sentence: str) -> str:
    """Blocking gTTS call — run in thread executor."""
    tts = gTTS(text=sentence, lang="en", slow=False)
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


async def sentence_to_audio(sentence: str) -> str:
    """Returns base64-encoded MP3 audio via gTTS (free)."""
    loop = asyncio.get_event_loop()
    audio_b64 = await loop.run_in_executor(None, _gtts_to_base64, sentence)
    return audio_b64


async def process_gloss(tokens: list[str]) -> str:
    """Full pipeline: tokens → base64 audio. Returns audio_b64."""
    sentence = await gloss_to_sentence(tokens)
    print(f"[Flow1] Gloss: {tokens} → Sentence: {sentence}")
    audio_b64 = await sentence_to_audio(sentence)
    return audio_b64
