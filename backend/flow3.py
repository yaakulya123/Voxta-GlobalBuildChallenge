import requests
import json
import os

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

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
    """Send a JPEG frame (base64) to OpenRouter API, return ASL gloss tokens."""
    try:
        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "http://localhost:5174",
                "X-Title": "Voxta",
                "Content-Type": "application/json",
            },
            data=json.dumps({
                "model": "google/gemini-2.5-flash", 
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": PROMPT},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}}
                        ]
                    }
                ],
                "max_tokens": 50,
            })
        )
        
        response.raise_for_status()
        result_json = response.json()
        result = result_json["choices"][0]["message"]["content"].strip().upper()
        
        print(f"[Flow3] Vision result: {result!r}")
        if not result or result == "UNCLEAR" or "UNCLEAR" in result:
            return []
        
        return [t.strip() for t in result.split() if t.strip()]
    except Exception as e:
        print(f"[Flow3 error] {e}")
        return []
