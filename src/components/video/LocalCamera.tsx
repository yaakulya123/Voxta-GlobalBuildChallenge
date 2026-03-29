import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { motion } from 'framer-motion';
import { Video, VideoOff, Wifi } from 'lucide-react';

interface LocalCameraProps {
  isOn: boolean;
}

export const LocalCamera: React.FC<LocalCameraProps> = ({ isOn }) => {
  const webcamRef = useRef<Webcam>(null);
  const [isReady, setIsReady] = useState(false);

  const handleUserMedia = useCallback(() => {
    setIsReady(true);
  }, []);

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden bg-app-bg border-[1px] border-white/10 shadow-2xl flex items-center justify-center">
      {/* Background/Placeholder */}
      {!isOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black p-8 text-center glass-panel">
          <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 shadow-inner">
            <VideoOff className="w-10 h-10 text-white/50" />
          </div>
          <h3 className="text-xl font-medium text-white/90">Camera is off</h3>
          <p className="text-white/50 mt-2 max-w-sm">
            Turn on your camera to enable sign language translation via MediaPipe.
          </p>
        </div>
      )}

      {/* Webcam Feed */}
      {isOn && (
        <>
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={true}
            onUserMedia={handleUserMedia}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "user" }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Glass Overlay indicating connection and AI status */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
            <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 border border-white/20">
              <div className="w-2 h-2 rounded-full bg-positive animate-pulse" />
              <span className="text-sm font-medium text-white/90">You</span>
            </div>
            
            {isReady && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel px-4 py-2 rounded-full flex items-center gap-2 border border-primary-accent/30 bg-primary-accent/10"
              >
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-accent"></span>
                </div>
                <span className="text-xs font-semibold text-primary-accent uppercase tracking-wider">
                  AI Active
                </span>
              </motion.div>
            )}
          </div>
          
          {/* Focus frame for ASL */}
          <div className="absolute inset-x-12 inset-y-24 border-2 border-white/10 border-dashed rounded-[3rem] pointer-events-none opacity-50" />
        </>
      )}
    </div>
  );
};
