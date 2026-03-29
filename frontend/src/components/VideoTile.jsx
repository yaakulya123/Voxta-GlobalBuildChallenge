import { useEffect, useRef } from 'react'

export default function VideoTile({ stream, label, pip = false, mirror = false }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  if (pip) {
    return (
      <div className="absolute bottom-4 left-4 z-10 rounded-xl overflow-hidden border-2 border-gray-700 shadow-lg" style={{ width: 200, height: 150 }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={mirror ? { transform: 'scaleX(-1)' } : {}}
        />
        {label && (
          <span className="absolute bottom-1 left-2 text-xs text-white bg-black/60 px-1 rounded">
            {label}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-[#1a1a1a]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      {label && (
        <span className="absolute bottom-3 left-3 text-sm text-white bg-black/60 px-2 py-1 rounded-lg">
          {label}
        </span>
      )}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
          Waiting for connection...
        </div>
      )}
    </div>
  )
}
