import React from 'react';
import { MicOff } from 'lucide-react';

interface RemoteVideoProps {
  name: string;
  isSpeaking?: boolean;
}

export const RemoteVideo: React.FC<RemoteVideoProps> = ({ name, isSpeaking = true }) => {
  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-black shadow-2xl border-[1px] border-white/10 group flex items-center justify-center">
      
      {/* Mock 3D Avatar or stylized placeholder for the remote user */}
      <div className="absolute inset-0 flex items-center justify-center opacity-40">
        <div className="w-[150%] h-[150%] absolute bg-primary-accent/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="w-64 h-64 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 blur-3xl opacity-50 animate-pulse transition-opacity duration-1000" />
      </div>

      <div className="z-10 flex flex-col items-center">
        {!isSpeaking && (
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6 shadow-inner glass-panel">
            <MicOff className="w-8 h-8 text-white/50" />
          </div>
        )}
      </div>

      {/* Name tag overlay */}
      <div className="absolute top-4 left-4 glass-panel px-4 py-2 rounded-full flex items-center gap-3 border border-white/20">
        {isSpeaking && (
          <div className="flex gap-1 items-center">
            <div className="w-1 h-3 bg-white/80 rounded-full animate-[bounce_1s_infinite]" />
            <div className="w-1 h-4 bg-white/80 rounded-full animate-[bounce_1.2s_infinite]" />
            <div className="w-1 h-2 bg-white/80 rounded-full animate-[bounce_0.8s_infinite]" />
          </div>
        )}
        <span className="text-sm font-medium text-white/90">{name}</span>
      </div>

      {isSpeaking && (
        <div className="absolute inset-0 border-2 border-primary-accent/40 rounded-3xl pointer-events-none transition-opacity duration-300" />
      )}
    </div>
  );
};
