import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from room_manager import manager
from flow1 import process_gloss
from flow3 import recognize_sign
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(ws: WebSocket, room_id: str):
    await ws.accept()
    await manager.join(room_id, ws)

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            # ── WebRTC signaling relay ──
            if msg_type in ("offer", "answer", "ice"):
                await manager.broadcast(room_id, data, exclude=ws)

            elif msg_type == "join":
                await manager.broadcast(
                    room_id,
                    {
                        "type": "joined",
                        "room": room_id,
                        "peerId": id(ws),
                        "name": data.get("name", "Anonymous"),
                        "role": data.get("role", "hearing"),
                    },
                    exclude=ws,
                )

            # ── Flow 1: gloss tokens → TTS audio ──
            elif msg_type == "gloss":
                tokens = data.get("tokens", [])
                if tokens:
                    asyncio.create_task(handle_flow1(ws, room_id, tokens))

            # ── Peer info relay (so new joiners learn about existing peers) ──
            elif msg_type == "peer_info":
                await manager.broadcast(room_id, data, exclude=ws)

            # ── Chat / raise hand / reactions relay ──
            elif msg_type in ("chat", "raise_hand", "reaction"):
                await manager.broadcast(room_id, data, exclude=ws)

            # ── Flow 3: video frame → ASL recognition ──
            elif msg_type == "video_frame":
                frame_b64 = data.get("frame_b64", "")
                if frame_b64:
                    asyncio.create_task(handle_flow3(room_id, frame_b64, ws))

            # ── Spoken text relay ──
            elif msg_type == "spoken_text":
                await manager.broadcast(room_id, data, exclude=ws)

    except WebSocketDisconnect:
        await manager.leave(room_id, ws)


async def handle_flow1(ws: WebSocket, room_id: str, tokens: list[str]):
    try:
        audio_b64 = await process_gloss(tokens)
        await manager.broadcast(
            room_id,
            {"type": "tts_audio", "audio_b64": audio_b64, "room": room_id},
            exclude=ws,
        )
    except Exception as e:
        print(f"[Flow1 error] {e}")


async def handle_flow2(room_id: str, chunk_b64: str, sender_ws: WebSocket):
    try:
        tokens = await process_audio_chunk(chunk_b64)
        if tokens:
            await manager.broadcast(
                room_id,
                {"type": "asl_gloss", "tokens": tokens, "room": room_id},
                exclude=sender_ws,
            )
    except Exception as e:
        print(f"[Flow2 error] {e}")


async def handle_flow3(room_id: str, frame_b64: str, sender_ws: WebSocket):
    try:
        tokens = await recognize_sign(frame_b64)
        if tokens:
            await manager.broadcast(
                room_id,
                {"type": "asl_gloss", "tokens": tokens, "room": room_id},
                exclude=sender_ws,
            )
    except Exception as e:
        print(f"[Flow3 error] {e}")
