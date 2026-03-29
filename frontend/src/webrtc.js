let pc = null
let _sendSignal = null
let _onRemoteStream = null

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export function init(localStream, onRemoteStream, sendSignal) {
  _sendSignal = sendSignal
  _onRemoteStream = onRemoteStream

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))

  pc.onicecandidate = (event) => {
    if (event.candidate) sendSignal({ type: 'ice', candidate: event.candidate })
  }

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) onRemoteStream(event.streams[0])
  }

  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] state:', pc.connectionState)
  }
}

export async function createOffer() {
  if (!pc) return
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  _sendSignal({ type: 'offer', sdp: pc.localDescription })
}

export async function handleOffer(sdp) {
  if (!pc) return
  await pc.setRemoteDescription(new RTCSessionDescription(sdp))
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  _sendSignal({ type: 'answer', sdp: pc.localDescription })
}

export async function handleAnswer(sdp) {
  if (!pc) return
  await pc.setRemoteDescription(new RTCSessionDescription(sdp))
}

export async function addIce(candidate) {
  if (!pc) return
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  } catch (e) {
    console.error('[WebRTC] addIce error', e)
  }
}

export async function replaceVideoTrack(newTrack) {
  if (!pc) return
  const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video')
  if (sender) await sender.replaceTrack(newTrack)
}

export function close() {
  if (pc) {
    pc.close()
    pc = null
  }
}
