"""
Download ASL word sign GIFs from Lifeprint.com and save to public/asl/words/
Run: python download_asl.py
"""
import os
import time
import requests

OUT_DIR = os.path.join(os.path.dirname(__file__), "public", "asl", "words")
os.makedirs(OUT_DIR, exist_ok=True)

WORDS = [
    "hello","hi","goodbye","bye","please","thank-you","sorry","welcome",
    "yes","no","maybe","okay","good","bad","help","stop","wait","more",
    "want","need","have","know","think","like","love","understand","forget",
    "learn","work","eat","drink","sleep","give","take","make","call","meet",
    "what","where","when","who","why","how","which",
    "i","me","you","he","she","we","they","my","your","name",
    "friend","family","mother","father","brother","sister","baby","doctor","teacher",
    "home","school","hospital","store","bathroom","restaurant","outside","here","there",
    "now","later","today","tomorrow","yesterday","morning","afternoon","night",
    "always","never","sometimes","again","before","after",
    "big","small","fast","slow","hot","cold","sick","tired","hungry",
    "happy","sad","angry","scared","beautiful","important","easy","hard",
    "new","old","right","wrong","same","different",
    "water","food","money","car","phone","computer","book",
    "one","two","three","four","five","ten",
    "red","blue","green","white","black",
    "and","but","because","if","not","with","for","very","much",
    "go","come","see","look","hear","ask","tell","open","close","change","finish","try",
    "read","write","talk","speak","sign","feel","walk","run","sit","stand",
    "pain","sick","medicine","allergic","emergency","help-me",
    "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
    "bathroom","hungry","thirsty","tired","bored","confused","excited","nervous",
    "please-repeat","i-dont-understand","slow-down","thank-you",
]

# Lifeprint URL patterns to try (in order) — GIFs first, then MP4 videos
def get_urls(word):
    first = word[0]
    return [
        (f"https://www.lifeprint.com/asl101/gifs/{first}/{word}.gif",    ".gif"),
        (f"https://www.lifeprint.com/asl101/images-signs/{word}.gif",    ".gif"),
        (f"https://www.lifeprint.com/asl101/gifs/{first}/{word}1.gif",   ".gif"),
        (f"https://www.lifeprint.com/asl101/videos/{word}.mp4",          ".mp4"),
        (f"https://www.lifeprint.com/asl101/videos/{word}1.mp4",         ".mp4"),
    ]

HEADERS = {"User-Agent": "Mozilla/5.0 (educational ASL project)"}

found = []
not_found = []

for word in WORDS:
    # Check if any extension already downloaded
    existing = next((e for e in ('.gif', '.mp4') if os.path.exists(os.path.join(OUT_DIR, f"{word}{e}"))), None)
    if existing:
        print(f"  skip (exists): {word}{existing}")
        found.append(f"{word}{existing}")
        continue

    downloaded = False
    for url, ext in get_urls(word):
        try:
            r = requests.get(url, headers=HEADERS, timeout=8)
            ct = r.headers.get("content-type", "")
            ok = r.status_code == 200 and (ct.startswith("image") or ct.startswith("video"))
            if ok:
                actual_path = os.path.join(OUT_DIR, f"{word}{ext}")
                with open(actual_path, "wb") as f:
                    f.write(r.content)
                print(f"  ✓ {word}{ext}  ({url})")
                found.append(f"{word}{ext}")   # store as "word.ext" string
                downloaded = True
                time.sleep(0.15)
                break
        except Exception:
            pass

    if not downloaded:
        print(f"  ✗ {word}")
        not_found.append(word)

print(f"\n=== Done: {len(found)} downloaded, {len(not_found)} not found ===")
print("\nNot found (will fingerspell):")
print(", ".join(not_found))

# Generate the TypeScript word map pointing to local files
ts_lines = ['export const ASL_LOCAL_WORDS: Record<string, string> = {']
for fname in sorted(found):
    name = fname.rsplit('.', 1)[0]   # strip extension
    key  = name.replace("-", " ").replace("_", " ")
    ts_lines.append(f'  "{key}": "/asl/words/{fname}",')
ts_lines.append('};')
ts_out = os.path.join(os.path.dirname(__file__), "src", "lib", "aslLocalWords.ts")
with open(ts_out, "w") as f:
    f.write("\n".join(ts_lines) + "\n")
print(f"\nGenerated: {ts_out}")
