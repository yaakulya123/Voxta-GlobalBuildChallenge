let ws = null
let messageHandler = null
let queue = []   // messages sent before WS is open

export function connect(roomId) {
  if (ws && ws.readyState === WebSocket.OPEN) return
  ws = new WebSocket(`ws://localhost:8000/ws/${roomId}`)

  ws.onopen = () => {
    console.log('[WS] connected')
    // Flush queued messages
    queue.forEach((msg) => ws.send(msg))
    queue = []
  }

  ws.onclose = () => console.log('[WS] disconnected')
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

export function send(obj) {
  const payload = JSON.stringify(obj)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(payload)
  } else if (ws && ws.readyState === WebSocket.CONNECTING) {
    queue.push(payload)   // will be flushed on open
  } else {
    console.warn('[WS] not connected, cannot send', obj)
  }
}

export function onMessage(handler) {
  messageHandler = handler
}

export function disconnect() {
  queue = []
  if (ws) {
    ws.close()
    ws = null
  }
}
