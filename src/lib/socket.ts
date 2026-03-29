// @ts-nocheck
let ws = null
let messageHandler = null
let queue = []   // messages sent before WS is open
let currentRoomId = null
let reconnectTimer = null
const MAX_RECONNECT_DELAY = 10000
let reconnectDelay = 1000

export async function connect(roomId: string) {
  if (ws && ws.readyState === WebSocket.OPEN) return

  currentRoomId = roomId

  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'localhost:8000';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const httpProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

  const url = import.meta.env.VITE_BACKEND_URL ? `${protocol}//${backendUrl}/ws/${roomId}` : `ws://localhost:8000/ws/${roomId}`;
  const httpUrl = import.meta.env.VITE_BACKEND_URL ? `${httpProtocol}//${backendUrl}/` : `http://localhost:8000/`;

  // Bypass LocalTunnel anti-phishing page if using loca.lt
  if (backendUrl.includes('loca.lt')) {
    try {
      await fetch(httpUrl, { headers: { 'bypass-tunnel-reminder': 'true' } });
    } catch(e) {}
  }

  console.log('[WS] connecting to', url)
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[WS] connected')
    reconnectDelay = 1000  // reset backoff on success
    // Flush queued messages
    queue.forEach((msg) => ws.send(msg))
    queue = []
  }

  ws.onclose = (e) => {
    console.log('[WS] disconnected', e.code, e.reason)
    ws = null
    // Auto-reconnect unless we intentionally disconnected
    if (currentRoomId) {
      scheduleReconnect()
    }
  }

  ws.onerror = (e) => console.error('[WS] error', e)

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (messageHandler) messageHandler(msg)
    } catch (e) {
      console.error('[WS] parse error', e)
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  console.log(`[WS] reconnecting in ${reconnectDelay}ms...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (currentRoomId) {
      connect(currentRoomId)
    }
    // Exponential backoff capped at MAX_RECONNECT_DELAY
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }, reconnectDelay)
}

export function send(obj) {
  const payload = JSON.stringify(obj)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload)
  } else if (ws && ws.readyState === WebSocket.CONNECTING) {
    queue.push(payload)   // will be flushed on open
  } else {
    console.warn('[WS] not connected, queuing message', obj)
    queue.push(payload)
  }
}

export function onMessage(handler) {
  messageHandler = handler
}

export function disconnect() {
  currentRoomId = null  // prevent auto-reconnect
  queue = []
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
}
