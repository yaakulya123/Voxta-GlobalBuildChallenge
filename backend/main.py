import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from room_manager import manager
from flow1 import process_gloss, process_gloss_full
from flow3 import recognize_sign
from flow_video import recognize_sign_from_clip
from flow_landmarks import recognize_from_landmarks
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

            # ── Flow 3: single video frame → ASL recognition (legacy) ──
            elif msg_type == "video_frame":
                frame_b64 = data.get("frame_b64", "")
                if frame_b64:
                    asyncio.create_task(handle_flow3(room_id, frame_b64, ws))

            # ── Landmark clip: MediaPipe hand trajectory → ASL recognition (primary) ──
            elif msg_type == "landmark_clip":
                landmark_frames = data.get("landmarks", [])
                print(f"[Backend] landmark_clip received: {len(landmark_frames)} frames")
                if landmark_frames:
                    asyncio.create_task(handle_flow_landmarks(room_id, landmark_frames, ws))

            # ── Flow Video: JPEG frames fallback (when landmarks unavailable) ──
            elif msg_type == "video_clip":
                frames = data.get("frames", [])
                print(f"[Backend] video_clip received: {len(frames)} frames")
                if frames:
                    asyncio.create_task(handle_flow_video(room_id, frames, ws))
                else:
                    print("[Backend] video_clip had 0 frames — nothing sent from frontend")

            # ── Spoken text relay ──
            elif msg_type == "spoken_text":
                await manager.broadcast(room_id, data, exclude=ws)

    except WebSocketDisconnect:
        await manager.leave(room_id, ws)
    except Exception as e:
        print(f"[WS] Unexpected error in room {room_id}: {e}")
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


async def handle_flow_landmarks(room_id: str, landmark_frames: list, sender_ws: WebSocket):
    try:
        tokens = await recognize_from_landmarks(landmark_frames)
        if tokens:
            sentence, audio_b64 = await process_gloss_full(tokens)
            await manager.broadcast(
                room_id,
                {"type": "translated_sentence", "sentence": sentence, "room": room_id},
                exclude=sender_ws,
            )
            await manager.broadcast(
                room_id,
                {"type": "tts_audio", "audio_b64": audio_b64, "room": room_id},
            )
            await manager.send_to(
                sender_ws,
                {"type": "clip_result", "status": "ok", "sentence": sentence, "room": room_id},
            )
        else:
            await manager.send_to(
                sender_ws,
                {"type": "clip_result", "status": "unclear", "room": room_id},
            )
    except Exception as e:
        print(f"[FlowLandmarks error] {e}")


async def handle_flow_video(room_id: str, frames: list[str], sender_ws: WebSocket):
    try:
        tokens = await recognize_sign_from_clip(frames)
        if tokens:
            # Convert gloss → natural English sentence + TTS audio in one step
            sentence, audio_b64 = await process_gloss_full(tokens)

            # 1. Show the natural sentence as captions on the hearing peer's screen
            await manager.broadcast(
                room_id,
                {"type": "translated_sentence", "sentence": sentence, "room": room_id},
                exclude=sender_ws,
            )
            # 2. Play the sentence as voice for everyone in the room
            await manager.broadcast(
                room_id,
                {"type": "tts_audio", "audio_b64": audio_b64, "room": room_id},
            )
            # 3. Echo the sentence back to the deaf sender as confirmation
            await manager.send_to(
                sender_ws,
                {"type": "clip_result", "status": "ok", "sentence": sentence, "room": room_id},
            )
        else:
            # Notify sender that no sign was detected
            await manager.send_to(
                sender_ws,
                {"type": "clip_result", "status": "unclear", "room": room_id},
            )
    except Exception as e:
        print(f"[FlowVideo error] {e}")
