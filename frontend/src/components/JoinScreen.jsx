import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function JoinScreen() {
  const [roomId, setRoomId] = useState('')
  const [name, setName] = useState('')
  const navigate = useNavigate()

  const join = (role) => {
    const id = roomId.trim() || 'room1'
    const n = encodeURIComponent(name.trim() || (role === 'deaf' ? 'Deaf User' : 'Hearing User'))
    navigate(`/room/${id}?role=${role}&name=${n}`)
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="bg-[#1a1a1a] rounded-2xl p-10 w-full max-w-md shadow-2xl border border-gray-800">
        <h1 className="text-4xl font-bold text-white text-center mb-2">SignBridge</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">
          Real-time sign language &amp; speech bridge
        </p>

        <div className="mb-4">
          <label className="block text-gray-400 text-sm mb-2">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full bg-[#2a2a2a] text-white rounded-xl px-4 py-3 outline-none border border-gray-700 focus:border-blue-500 transition"
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-400 text-sm mb-2">Room ID</label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join('deaf')}
            placeholder="Enter room ID (e.g. room1)"
            className="w-full bg-[#2a2a2a] text-white rounded-xl px-4 py-3 outline-none border border-gray-700 focus:border-blue-500 transition"
          />
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => join('deaf')}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 transition"
          >
            Join as Deaf / Mute
          </button>
          <button
            onClick={() => join('hearing')}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl py-3 transition"
          >
            Join as Hearing
          </button>
        </div>

        <p className="text-gray-600 text-xs text-center mt-6">
          Both users must join the same room ID
        </p>
      </div>
    </div>
  )
}
