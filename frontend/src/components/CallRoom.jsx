import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import VideoTile from './VideoTile.jsx'
import ASLOverlay from './ASLOverlay.jsx'
import { connect, send, onMessage, disconnect } from '../socket.js'
import {
  init as initWebRTC,
  createOffer,
  handleOffer,
  handleAnswer,
  addIce,
  replaceVideoTrack,
  close as closeRTC,
} from '../webrtc.js'
import { playBase64Audio } from '../audioPlayer.js'
import { play as aslPlay } from '../aslRenderer.js'
import { initGestureDetector, detectGesture } from '../gestureDetector.js'

const REACTIONS = ['👍', '❤️', '😂', '👏', '🎉']

function Avatar({ name, role, size = 10 }) {
  const initial = (name || '?')[0].toUpperCase()
  const bg = role === 'deaf' ? 'bg-blue-700' : 'bg-emerald-700'
  return (
    <div className={`${bg} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ width: size * 4, height: size * 4, fontSize: size * 1.6 }}>
      {initial}
    </div>
  )
}

function ParticipantStrip({ self, peer }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-[#111] border-b border-gray-800">
      <ParticipantCard {...self} isYou />
      {peer
        ? <ParticipantCard {...peer} />
        : (
          <div className="flex items-center gap-2 bg-[#1e1e1e] rounded-xl px-3 py-1.5 border border-dashed border-gray-700">
            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 text-xs">?</div>
            <span className="text-gray-500 text-xs">Waiting for peer...</span>
          </div>
        )
      }
    </div>
  )
}

function ParticipantCard({ name, role, isYou }) {
  return (
    <div className="flex items-center gap-2 bg-[#1e1e1e] rounded-xl px-3 py-1.5 border border-gray-800">
      <Avatar name={name} role={role} size={7} />
      <div className="flex flex-col leading-tight">
        <span className="text-white text-xs font-semibold">{name}{isYou ? ' (You)' : ''}</span>
        <span className={`text-xs ${role === 'deaf' ? 'text-blue-400' : 'text-emerald-400'}`}>
          {role === 'deaf' ? 'Deaf / Mute' : 'Hearing'}
        </span>
      </div>
    </div>
  )
}

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Floating reaction bubble component
function ReactionBubble({ emoji, id, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      key={id}
      className="pointer-events-none absolute text-4xl animate-bounce"
      style={{
        bottom: '80px',
        right: `${60 + Math.random() * 100}px`,
        animation: 'floatUp 2.5s ease-out forwards',
      }}
    >
      {emoji}
    </div>
  )
}

export default function CallRoom() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role') || 'hearing'
  const myName = searchParams.get('name') || (role === 'deaf' ? 'Deaf User' : 'Hearing User')
  const navigate = useNavigate()

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [status, setStatus] = useState('Connecting...')

  // Chat
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const chatBottomRef = useRef(null)

  // Screen share
  const [isSharing, setIsSharing] = useState(false)
  const screenStreamRef = useRef(null)

  // Raise hand
  const [handRaised, setHandRaised] = useState(false)
  const [remoteHandRaised, setRemoteHandRaised] = useState(false)

  // Peer info (name + role)
  const [peerInfo, setPeerInfo] = useState(null)

  // Gesture translation toggle (deaf role only)
  const [gesturePaused, setGesturePaused] = useState(false)
  const gesturePausedRef = useRef(false)

  // Reactions
  const [floatingReactions, setFloatingReactions] = useState([])
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const localStreamRef = useRef(null)
  const glossTimerRef = useRef(null)
  const accTimerRef = useRef(null)
  const glossTokensRef = useRef([])
  const gestureVideoRef = useRef(null)
  const rafRef = useRef(null)

  const sendSignal = useCallback((msg) => {
    send({ ...msg, room: roomId })
  }, [roomId])

  // Keep ref in sync so rAF loop sees updates without stale closure
  useEffect(() => { gesturePausedRef.current = gesturePaused }, [gesturePaused])

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset unread when chat opens
  useEffect(() => {
    if (chatOpen) setUnreadCount(0)
  }, [chatOpen])

  useEffect(() => {
    let mounted = true

    async function setup() {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch (e) {
        setStatus('Camera/mic access denied')
        return
      }
      if (!mounted) return
      localStreamRef.current = stream
      setLocalStream(stream)

      connect(roomId)

      onMessage(async (msg) => {
        if (!mounted) return
        switch (msg.type) {
          case 'joined':
            setStatus('Peer joined — starting call')
            setPeerInfo({ name: msg.name, role: msg.role })
            // Send our own info so the new joiner knows who we are
            send({ type: 'peer_info', room: roomId, name: myName, role })
            if (role === 'deaf') {
              initWebRTC(localStreamRef.current, (s) => setRemoteStream(s), sendSignal)
              await createOffer()
            }
            break
          case 'peer_info':
            setPeerInfo({ name: msg.name, role: msg.role })
            break
          case 'offer':
            if (role === 'hearing') {
              initWebRTC(localStreamRef.current, (s) => setRemoteStream(s), sendSignal)
            }
            await handleOffer(msg.sdp)
            setStatus('Connected')
            break
          case 'answer':
            await handleAnswer(msg.sdp)
            setStatus('Connected')
            break
          case 'ice':
            await addIce(msg.candidate)
            break
          case 'tts_audio':
            if (role === 'hearing') playBase64Audio(msg.audio_b64)
            break
          case 'asl_gloss':
            if (role === 'deaf') aslPlay(msg.tokens)
            break
          case 'chat':
            setMessages((prev) => [...prev, { sender: msg.sender, text: msg.text, ts: msg.ts, self: false }])
            setUnreadCount((n) => chatOpen ? 0 : n + 1)
            break
          case 'raise_hand':
            setRemoteHandRaised(msg.raised)
            break
          case 'reaction':
            addReaction(msg.emoji)
            break
          default:
            break
        }
      })

      send({ type: 'join', room: roomId, role, name: myName })
      setStatus('Waiting for peer...')

      if (role === 'deaf') startGlossLoop(roomId)
      else startMicCapture(roomId, stream)
    }

    setup()

    return () => {
      mounted = false
      clearInterval(glossTimerRef.current)
      clearInterval(accTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      disconnect()
      closeRTC()
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop())
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [roomId, role])

  async function startGlossLoop(roomId) {
    // Init MediaPipe gesture recognizer
    try {
      await initGestureDetector()
    } catch (e) {
      console.error('[Gesture] init failed', e)
      return
    }

    // Attach local stream to a hidden video element for frame-by-frame detection
    const video = gestureVideoRef.current
    if (!video) return
    video.srcObject = localStreamRef.current
    await video.play().catch(() => {})

    // rAF loop: detect gestures and accumulate tokens
    function loop() {
      if (!gesturePausedRef.current) {
        const tokens = detectGesture(video)
        if (tokens.length > 0) {
          glossTokensRef.current.push(...tokens)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    // Flush accumulated tokens every 2 seconds
    glossTimerRef.current = setInterval(() => {
      const tokens = [...glossTokensRef.current]
      glossTokensRef.current = []
      if (tokens.length > 0) send({ type: 'gloss', room: roomId, tokens })
    }, 2000)
  }

  function startMicCapture(roomId, stream) {
    const SAMPLE_RATE = 16000
    const CHUNK_SAMPLES = SAMPLE_RATE * 2   // 2-second chunks
    const VAD_THRESHOLD = 0.012             // RMS below this = silence, skip
    const SPEECH_RATIO = 0.3               // at least 30% of frames must be above threshold

    function rms(samples) {
      let sum = 0
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
      return Math.sqrt(sum / samples.length)
    }

    function hasSpeech(chunk) {
      // Check RMS of the whole chunk first (fast path)
      if (rms(chunk) < VAD_THRESHOLD) return false
      // Also verify enough frames are active (avoids single loud noise triggering)
      const frameSize = 1024
      let activeFrames = 0
      for (let i = 0; i + frameSize < chunk.length; i += frameSize) {
        if (rms(chunk.slice(i, i + frameSize)) > VAD_THRESHOLD) activeFrames++
      }
      const totalFrames = Math.floor(chunk.length / frameSize)
      return (activeFrames / totalFrames) >= SPEECH_RATIO
    }

    try {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      let buffer = []
      processor.onaudioprocess = (e) => {
        buffer.push(...Array.from(e.inputBuffer.getChannelData(0)))
        if (buffer.length >= CHUNK_SAMPLES) {
          const chunk = buffer.splice(0, CHUNK_SAMPLES)
          if (!hasSpeech(chunk)) return   // skip silence
          const b64 = arrayBufferToBase64(encodeWAV(chunk, SAMPLE_RATE))
          send({ type: 'audio_chunk', room: roomId, chunk_b64: b64 })
        }
      }
      source.connect(processor)
      processor.connect(ctx.destination)
    } catch (e) {
      console.error('[Mic capture error]', e)
    }
  }

  // ── Chat ──
  const sendChat = () => {
    const text = chatInput.trim()
    if (!text) return
    const senderLabel = role === 'deaf' ? 'Deaf/Mute' : 'Hearing'
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    send({ type: 'chat', room: roomId, sender: senderLabel, text, ts })
    setMessages((prev) => [...prev, { sender: 'You', text, ts, self: true }])
    setChatInput('')
  }

  // ── Screen share ──
  const toggleScreenShare = async () => {
    if (isSharing) {
      // Stop sharing — restore camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop())
        screenStreamRef.current = null
      }
      const camTrack = localStreamRef.current?.getVideoTracks()[0]
      if (camTrack) await replaceVideoTrack(camTrack)
      setIsSharing(false)
      setLocalStream(localStreamRef.current)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]
        await replaceVideoTrack(screenTrack)
        // Show screen in local tile
        const mixed = new MediaStream([screenTrack, ...localStreamRef.current.getAudioTracks()])
        setLocalStream(mixed)
        setIsSharing(true)
        // Auto-stop when user clicks browser's stop sharing
        screenTrack.onended = () => toggleScreenShare()
      } catch (e) {
        console.log('[ScreenShare] cancelled or denied')
      }
    }
  }

  // ── Raise hand ──
  const toggleHand = () => {
    const next = !handRaised
    setHandRaised(next)
    send({ type: 'raise_hand', room: roomId, raised: next })
  }

  // ── Reactions ──
  const addReaction = (emoji) => {
    const id = Date.now() + Math.random()
    setFloatingReactions((prev) => [...prev, { emoji, id }])
  }

  const sendReaction = (emoji) => {
    send({ type: 'reaction', room: roomId, emoji })
    addReaction(emoji)
    setShowReactionPicker(false)
  }

  // ── Controls ──
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
    setMuted((m) => !m)
  }

  const toggleCam = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled })
    setCamOff((c) => !c)
  }

  const leaveCall = () => {
    disconnect(); closeRTC()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current?.getTracks().forEach((t) => t.stop())
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col select-none overflow-hidden">
      {/* Hidden video element used by MediaPipe gesture detector (deaf role only) */}
      {role === 'deaf' && (
        <video ref={gestureVideoRef} muted playsInline className="hidden" />
      )}
      <style>{`
        @keyframes floatUp {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-120px) scale(1.4); }
        }
        .float-up { animation: floatUp 2.5s ease-out forwards; }
      `}</style>

      {/* Participant strip */}
      <ParticipantStrip
        self={{ name: myName, role }}
        peer={peerInfo}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-[#1a1a1a] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white text-lg">SignBridge</span>
          <span className="text-gray-400 text-sm">
            Room: <span className="text-blue-400 font-mono">{roomId}</span>
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${role === 'deaf' ? 'bg-blue-900 text-blue-300' : 'bg-emerald-900 text-emerald-300'}`}>
            {role === 'deaf' ? 'Deaf / Mute' : 'Hearing'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{status}</span>
          {remoteHandRaised && (
            <span className="text-yellow-400 text-sm animate-pulse">✋ Peer raised hand</span>
          )}
          <button onClick={leaveCall} className="bg-red-700 hover:bg-red-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition">
            Leave
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative p-4">
          {/* Remote video */}
          <div className="w-full rounded-2xl overflow-hidden bg-[#1a1a1a]" style={{ height: 'calc(100vh - 200px)' }}>
            <VideoTile stream={remoteStream} label={peerInfo ? `${peerInfo.name} · ${peerInfo.role === 'deaf' ? 'Deaf/Mute' : 'Hearing'}` : 'Remote'} />
          </div>

          {/* Self PiP */}
          <VideoTile stream={localStream} label={isSharing ? 'Screen' : `${myName} (You)`} pip mirror={!isSharing} />

          {/* ASL overlay */}
          <ASLOverlay visible={role === 'deaf'} />

          {/* Floating reactions */}
          {floatingReactions.map(({ emoji, id }) => (
            <div
              key={id}
              className="pointer-events-none absolute text-4xl float-up"
              style={{ bottom: '80px', right: `${60 + Math.random() * 80}px` }}
              onAnimationEnd={() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id))}
            >
              {emoji}
            </div>
          ))}

          {/* Reaction picker popover */}
          {showReactionPicker && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#2a2a2a] border border-gray-700 rounded-2xl px-4 py-3 flex gap-3 z-20 shadow-2xl">
              {REACTIONS.map((e) => (
                <button key={e} onClick={() => sendReaction(e)} className="text-3xl hover:scale-125 transition-transform">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="w-80 bg-[#1a1a1a] border-l border-gray-800 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="font-semibold text-white text-sm">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ minHeight: 0 }}>
              {messages.length === 0 && (
                <p className="text-gray-600 text-xs text-center mt-4">No messages yet</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.self ? 'items-end' : 'items-start'}`}>
                  <span className="text-gray-500 text-xs mb-0.5">{m.sender} · {m.ts}</span>
                  <div className={`rounded-2xl px-3 py-2 text-sm max-w-[220px] break-words ${m.self ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-[#2a2a2a] text-gray-100 rounded-bl-sm'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-gray-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Type a message..."
                className="flex-1 bg-[#2a2a2a] text-white text-sm rounded-xl px-3 py-2 outline-none border border-gray-700 focus:border-blue-500 transition"
              />
              <button
                onClick={sendChat}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-3 py-2 text-sm font-semibold transition"
              >
                ↑
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls bar */}
      <div className="flex items-center justify-center gap-2 px-6 py-3 bg-[#1a1a1a] border-t border-gray-800 shrink-0">
        {/* Gesture translation toggle (deaf only) */}
        {role === 'deaf' && (
          <ControlBtn
            active={gesturePaused}
            activeClass="bg-red-700 hover:bg-red-600"
            inactiveClass="bg-gray-700 hover:bg-gray-600"
            onClick={() => setGesturePaused((p) => !p)}
            label={gesturePaused ? '🤟 Signing Off' : '🤟 Signing On'}
          />
        )}

        {/* Mute */}
        <ControlBtn
          active={muted}
          activeClass="bg-red-700 hover:bg-red-600"
          inactiveClass="bg-gray-700 hover:bg-gray-600"
          onClick={toggleMute}
          label={muted ? '🎤 Unmute' : '🎤 Mute'}
        />

        {/* Camera */}
        <ControlBtn
          active={camOff}
          activeClass="bg-red-700 hover:bg-red-600"
          inactiveClass="bg-gray-700 hover:bg-gray-600"
          onClick={toggleCam}
          label={camOff ? '📷 Start Video' : '📷 Stop Video'}
        />

        {/* Screen share */}
        <ControlBtn
          active={isSharing}
          activeClass="bg-green-700 hover:bg-green-600"
          inactiveClass="bg-gray-700 hover:bg-gray-600"
          onClick={toggleScreenShare}
          label={isSharing ? '🖥 Stop Share' : '🖥 Share Screen'}
        />

        {/* Raise hand */}
        <ControlBtn
          active={handRaised}
          activeClass="bg-yellow-600 hover:bg-yellow-500"
          inactiveClass="bg-gray-700 hover:bg-gray-600"
          onClick={toggleHand}
          label="✋ Hand"
        />

        {/* Reactions */}
        <ControlBtn
          active={showReactionPicker}
          activeClass="bg-gray-600 hover:bg-gray-500"
          inactiveClass="bg-gray-700 hover:bg-gray-600"
          onClick={() => setShowReactionPicker((v) => !v)}
          label="😊 React"
        />

        {/* Chat */}
        <button
          onClick={() => { setChatOpen((v) => !v); setUnreadCount(0) }}
          className={`relative px-4 py-2 rounded-xl text-sm font-semibold transition text-white ${chatOpen ? 'bg-blue-700 hover:bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
        >
          💬 Chat
          {unreadCount > 0 && !chatOpen && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

function ControlBtn({ active, activeClass, inactiveClass, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition text-white ${active ? activeClass : inactiveClass}`}
    >
      {label}
    </button>
  )
}
