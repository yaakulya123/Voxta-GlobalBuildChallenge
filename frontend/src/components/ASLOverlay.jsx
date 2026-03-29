import { useEffect, useState } from 'react'
import { setImageCallback } from '../aslRenderer.js'

export default function ASLOverlay({ visible }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    setImageCallback(setSrc)
    return () => setImageCallback(null)
  }, [])

  if (!visible) return null

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1">
      <span className="text-xs text-gray-400 bg-black/60 px-2 py-0.5 rounded">
        ASL interpreter
      </span>
      <div className="w-[200px] h-[200px] rounded-xl border border-gray-700 shadow-lg bg-black flex items-center justify-center overflow-hidden">
        {src
          ? <img src={src} alt="ASL sign" className="w-full h-full object-contain" />
          : <span className="text-gray-600 text-xs">Waiting...</span>
        }
      </div>
    </div>
  )
}
