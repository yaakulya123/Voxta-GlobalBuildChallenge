"""Flow 3: Video frame → ASL sign recognition via Claude Vision"""

import anthropic
import os

anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

PROMPT = """You are an expert ASL (American Sign Language) interpreter.
Look at this image and identify the ASL sign(s) the person is making with their hands.

Rules:
1. Respond ONLY with the English word(s) the sign represents — ALL CAPS, 1-4 words max
2. If multiple distinct signs are visible, list them separated by spaces
3. If the hands are just resting or the sign is unclear, respond exactly: UNCLEAR
4. No explanation, no punctuation, no extra text — just the word(s)

Valid response examples:
HELLO
THANK YOU
WATER
PLEASE HELP ME
UNCLEAR"""


async def recognize_sign(frame_b64: str) -> list[str]:
    """Send a JPEG frame (base64) to Claude Vision, return ASL gloss tokens."""
    try:
        msg = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=50,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": frame_b64,
                        },
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }],
        )
        result = msg.content[0].text.strip().upper()
        print(f"[Flow3] Vision result: {result!r}")
        if not result or result == "UNCLEAR":
            return []
        return [t.strip() for t in result.split() if t.strip()]
    except Exception as e:
        print(f"[Flow3 error] {e}")
        return []
