import React, { useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { VideoOff } from 'lucide-react';

interface ThumbnailGridProps {
  isLocalVideoOn: boolean;
  isBlurOn: boolean;
  webcamRef: React.RefObject<Webcam | null>;
  peerStream?: MediaStream | null;
  peerInfo?: { name: string, role: string } | null;
  isRecording?: boolean;
}

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({ isLocalVideoOn, isBlurOn, webcamRef, peerStream, peerInfo, isRecording = false }) => {
  const [isReady, setIsReady] = React.useState(false);
  const peerVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (peerVideoRef.current && peerStream) {
      peerVideoRef.current.srcObject = peerStream;
    }
  }, [peerStream]);

  return (
    <div className="w-full h-32 md:h-40 flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
      {/* Remote Peer Camera Tile */}
      <div className="relative flex-shrink-0 w-48 md:w-64 h-full rounded-2xl overflow-hidden bg-panel-bg shadow-lg border border-white/5">
        {!peerStream ? (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-2">
             <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
             <span className="text-xs text-white/50">Waiting for peer...</span>
           </div>
        ) : (
          <video
            ref={peerVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}
        {peerInfo && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] md:text-xs font-medium border border-white/10 whitespace-nowrap">
            {peerInfo.name}
          </div>
        )}
      </div>

      {/* Local Camera Tile */}
      <div className="relative flex-shrink-0 w-48 md:w-64 h-full rounded-2xl overflow-hidden bg-panel-bg shadow-lg border border-primary-accent border-2">
        {!isLocalVideoOn ? (
           <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
             <VideoOff className="w-6 h-6 text-white/50" />
           </div>
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={true}
            screenshotFormat="image/jpeg"
            onUserMedia={() => setIsReady(true)}
            videoConstraints={{ facingMode: "user" }}
            className="w-full h-full object-cover"
            style={isBlurOn ? { filter: 'blur(8px)', WebkitFilter: 'blur(8px)' } : {}}
          />
        )}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium border border-white/10">
          You
        </div>
        {isReady && isLocalVideoOn && isRecording && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-[0_0_12px_rgba(220,38,38,0.7)] border border-red-400/40 animate-pulse">
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            <span className="text-[9px] font-bold tracking-wider text-white">RECORDING</span>
          </div>
        )}
        {isBlurOn && isLocalVideoOn && (
          <div className="absolute top-2 left-2 bg-purple-600/80 backdrop-blur-sm px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider text-white border border-white/20">
            BLUR
          </div>
        )}
      </div>
    </div>
  );
};
