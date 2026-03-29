"""Flow 2: WAV audio → English transcript → ASL gloss tokens
Uses local openai-whisper (free, no API key needed) + Claude for gloss conversion.
"""

import anthropic
import base64
import os
import tempfile
import asyncio
import whisper

anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Load Whisper model once at import time (tiny = fastest, ~39M params)
print("[Flow2] Loading Whisper model (tiny)...")
_whisper_model = whisper.load_model("tiny")
print("[Flow2] Whisper model loaded.")

ASL_GLOSS_PROMPT = """You convert English sentences into ASL gloss notation.

ASL gloss rules (strictly follow these):
1. Remove all articles: no "the", "a", "an"
2. Remove all "to be" verbs: no "is", "are", "was", "were", "am"
3. Use topic-comment structure: put the topic/object FIRST
4. Use base verb forms only: "going" → "GO", "running" → "RUN"
5. Remove conjunctions where possible: no "and", "but", "because"
6. Keep negation: "not" stays, placed after the verb
7. Use ALL CAPS for every token
8. Output ONLY the gloss tokens separated by spaces. Nothing else.

Examples:
"I am going to the store" → STORE I GO
"What is your name?" → NAME YOUR WHAT
"Can you please help me?" → HELP ME PLEASE YOU CAN
"I don't want that" → THAT WANT NOT I
"Nice to meet you" → MEET YOU NICE
"The weather is beautiful today" → TODAY WEATHER BEAUTIFUL
"""


def _whisper_transcribe(tmp_path: str) -> str:
    """Blocking Whisper call — run in thread executor."""
    result = _whisper_model.transcribe(tmp_path, language="en")
    return result["text"].strip()


async def transcribe_audio(audio_b64: str) -> str:
    """Decode base64 WAV, transcribe with local Whisper, return transcript."""
    audio_bytes = base64.b64decode(audio_b64)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        loop = asyncio.get_event_loop()
        transcript = await loop.run_in_executor(None, _whisper_transcribe, tmp_path)
    finally:
        os.unlink(tmp_path)

    return transcript


async def english_to_asl_gloss(transcript: str) -> list[str]:
    """Convert English text to ASL gloss tokens using Claude."""
    if not transcript:
        return []

    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        system=ASL_GLOSS_PROMPT,
        messages=[{"role": "user", "content": transcript}],
    )

    gloss_str = message.content[0].text.strip()
    tokens = [t.strip().upper() for t in gloss_str.split() if t.strip()]
    return tokens


async def process_audio_chunk(audio_b64: str) -> list[str]:
    """Full pipeline: base64 WAV → ASL gloss tokens."""
    try:
        transcript = await transcribe_audio(audio_b64)
        print(f"[Flow2] Transcript: {transcript!r}")

        if not transcript or len(transcript) < 3:
            return []  # silence or noise

        tokens = await english_to_asl_gloss(transcript)
        print(f"[Flow2] Gloss: {tokens}")
        return tokens

    except Exception as e:
        print(f"[Flow2 error] {e}")
        return []
