import React from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageSquare, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';

// Simple blur icon fallback since lucide may not have BlurIcon
const BlurSvg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" opacity="0.3"/>
    <circle cx="12" cy="12" r="6" opacity="0.6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

interface BottomControlsProps {
  isMicOn: boolean;
  isVideoOn: boolean;
  isChatOpen: boolean;
  isBlurOn: boolean;
  isScreenSharing: boolean;
  onToggleMic: () => void;
  onToggleVideo: () => void;
  onToggleChat: () => void;
  onToggleBlur: () => void;
  onToggleScreenShare: () => void;
  onLeave?: () => void;
}

export const BottomControls: React.FC<BottomControlsProps> = ({
  isMicOn,
  isVideoOn,
  isChatOpen,
  isBlurOn,
  isScreenSharing,
  onToggleMic,
  onToggleVideo,
  onToggleChat,
  onToggleBlur,
  onToggleScreenShare,
  onLeave,
}) => {

  const IconButton = ({ icon: Icon, customIcon, isActive, onClick, activeColor = "bg-primary-accent", defaultColor = "bg-[#2B2E36]", danger, label }: any) => (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 border border-white/5 hover:bg-opacity-80",
        danger 
          ? "bg-negative hover:bg-red-600" 
          : isActive ? activeColor : defaultColor
      )}
    >
      {customIcon ? customIcon : <Icon className={cn("w-5 h-5 md:w-6 md:h-6", isActive && defaultColor === "bg-[#2B2E36]" && !danger ? "text-white" : "text-white/80")} fill={danger ? "currentColor" : "none"} />}
    </button>
  );

  return (
    <div className="w-full h-20 bg-panel-bg rounded-2xl border border-white/5 mt-4 flex items-center justify-between px-6">
      
      {/* Left Context: Meeting Link */}
      <div className="hidden md:flex items-center gap-3 bg-app-bg px-4 py-2.5 rounded-xl border border-white/5">
        <span className="text-sm font-mono text-white/60">uxv-xqpy-rwj</span>
        <button className="text-white/40 hover:text-white transition-colors">
          <Copy className="w-4 h-4" />
        </button>
      </div>

      {/* Center Controls */}
      <div className="flex items-center gap-2 md:gap-3">
        <IconButton 
          icon={isMicOn ? Mic : MicOff} 
          isActive={!isMicOn}
          danger={!isMicOn}
          onClick={onToggleMic}
          label="Toggle Microphone"
        />
        <IconButton 
          icon={isVideoOn ? Video : VideoOff} 
          isActive={isVideoOn} 
          onClick={onToggleVideo}
          label="Toggle Camera"
        />
        <IconButton 
          icon={MonitorUp} 
          isActive={isScreenSharing} 
          onClick={onToggleScreenShare}
          label={isScreenSharing ? "Stop Sharing" : "Share Screen"}
        />
        <IconButton 
          icon={MessageSquare} 
          isActive={isChatOpen} 
          onClick={onToggleChat}
          label="Toggle Chat"
        />
        <IconButton 
          customIcon={<BlurSvg />}
          isActive={isBlurOn} 
          onClick={onToggleBlur}
          label={isBlurOn ? "Remove Blur" : "Blur Background"}
        />
      </div>

      {/* End Call */}
      <button 
        onClick={onLeave}
        className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm transition-colors shadow-lg shadow-red-500/20"
      >
        Leave Meet
      </button>

    </div>
  );
};
