from collections import defaultdict
from fastapi import WebSocket


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = defaultdict(list)

    async def join(self, room_id: str, ws: WebSocket):
        self.rooms[room_id].append(ws)

    async def leave(self, room_id: str, ws: WebSocket):
        if ws in self.rooms[room_id]:
            self.rooms[room_id].remove(ws)
        if not self.rooms[room_id]:
            del self.rooms[room_id]

    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket = None):
        import json
        for ws in list(self.rooms.get(room_id, [])):
            if ws is not exclude:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def send_to(self, ws: WebSocket, message: dict):
        await ws.send_json(message)


manager = RoomManager()  # singleton
