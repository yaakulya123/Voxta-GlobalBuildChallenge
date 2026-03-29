import React, { useRef, useEffect } from 'react';
import { ClosedCaptions } from '../ui/ClosedCaptions';
import { ASLPanel } from '../ui/ASLPanel';
import { User } from 'lucide-react';

interface FocusVideoProps {
  name: string;
  isSpeaking: boolean;
  captionsText?: string;
  isTranslating?: boolean;
  stream?: MediaStream | null;
  aslText?: string;
}

export const FocusVideo: React.FC<FocusVideoProps> = ({
  name,
  isSpeaking,
  captionsText = "",
  isTranslating = false,
  stream,
  aslText = "",
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`relative flex-1 w-full rounded-3xl overflow-hidden bg-app-bg flex flex-col justify-end transition-all duration-300 pointer-events-none custom-shadow ${isSpeaking ? 'ring-2 ring-primary-accent ring-opacity-80' : ''}`}>
      
      {/* Dynamic Video Feed */}
      {!stream ? (
         <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-gradient-to-b from-[#1E2028] to-app-bg">
            <div className="w-32 h-32 rounded-full border-2 border-white/5 flex items-center justify-center bg-panel-bg shadow-xl mb-6">
              <User className="w-12 h-12 text-white/20" />
            </div>
            <h3 className="text-white/40 font-medium tracking-wide">Waiting for peer stream...</h3>
         </div>
      ) : (
         <video
           ref={videoRef}
           autoPlay
           playsInline
           className="absolute inset-0 w-full h-full object-cover"
           style={{ transform: 'scaleX(-1)' }}
         />
      )}
      
      {/* Top Banner indicating the main focus */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
        <div className="bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
           {isSpeaking && (
             <span className="relative flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
             </span>
           )}
           <span className="text-sm font-medium tracking-wide text-white drop-shadow-sm">{name}</span>
        </div>
      </div>

      {/* ASL Translation Window — top-right corner (TV interpreter style) */}
      <div className="absolute top-4 right-4 z-20">
        <ASLPanel text={aslText} />
      </div>

      {/* Closed Captions — bottom center */}
      <div className="absolute bottom-6 md:bottom-12 w-full z-20 flex justify-center pb-safe">
        <ClosedCaptions
          text={captionsText}
          isTranslating={isTranslating}
        />
      </div>

      {/* Vignette Overlay for Depth */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-app-bg/60 via-transparent to-black/20" />
    </div>
  );
};
