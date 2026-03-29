/**
 * Mock WebSocket server for SignBridge — no real backend needed.
 * Run: node mock-server.js
 * Listens on ws://localhost:8000/ws/:roomId
 */

const { WebSocketServer, WebSocket } = require('ws')
const http = require('http')
const url = require('url')

// Minimal silent WAV (0.1s, 8kHz, mono, 16-bit PCM) as base64
function makeSilentWavBase64() {
  const sampleRate = 8000
  const numSamples = 800 // 0.1s
  const dataBytes = numSamples * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)  // PCM
  buf.writeUInt16LE(1, 22)  // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  // rest is zeros (silence)
  return buf.toString('base64')
}

const FAKE_AUDIO_B64 = makeSilentWavBase64()

/** @type {Map<string, Set<WebSocket>>} */
const rooms = new Map()

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('SignBridge mock server\n')
})

const wss = new WebSocketServer({ server, path: '/ws' })

// Handle paths like /ws/room1
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname
  const match = pathname.match(/^\/ws\/(.+)$/)
  if (!match) {
    socket.destroy()
    return
  }
  request._roomId = match[1]
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

wss.on('connection', (ws, request) => {
  const roomId = request._roomId
  console.log(`[Server] client connected to room: ${roomId}`)

  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  rooms.get(roomId).add(ws)

  ws.on('message', (raw) => {
    let data
    try { data = JSON.parse(raw) } catch { return }

    const { type } = data
    console.log(`[Server] [${roomId}] ${type}`)

    if (type === 'join') {
      // Notify others in the room
      broadcast(roomId, { type: 'joined', room: roomId, peerId: Date.now() }, ws)
    } else if (['offer', 'answer', 'ice'].includes(type)) {
      broadcast(roomId, data, ws)
    } else if (type === 'gloss') {
      // Simulate Flow 1: after 800ms send fake TTS audio back to room (excluding sender)
      setTimeout(() => {
        broadcast(roomId, {
          type: 'tts_audio',
          audio_b64: FAKE_AUDIO_B64,
          room: roomId,
        }, ws)
      }, 800)
    } else if (type === 'audio_chunk') {
      // Simulate Flow 2: after 800ms send fake ASL gloss back to room (excluding sender)
      setTimeout(() => {
        broadcast(roomId, {
          type: 'asl_gloss',
          tokens: ['STORE', 'I', 'GO'],
          room: roomId,
        }, ws)
      }, 800)
    } else if (['chat', 'raise_hand', 'reaction'].includes(type)) {
      broadcast(roomId, data, ws)
    }
  })

  ws.on('close', () => {
    console.log(`[Server] client disconnected from room: ${roomId}`)
    rooms.get(roomId)?.delete(ws)
    if (rooms.get(roomId)?.size === 0) rooms.delete(roomId)
  })
})

function broadcast(roomId, message, exclude) {
  const room = rooms.get(roomId)
  if (!room) return
  const payload = JSON.stringify(message)
  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  }
}

const PORT = 8000
server.listen(PORT, () => {
  console.log(`[SignBridge mock server] ws://localhost:${PORT}/ws/:roomId`)
})
