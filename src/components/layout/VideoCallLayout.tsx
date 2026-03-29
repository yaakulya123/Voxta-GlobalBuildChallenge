import React from 'react';
import { Header } from './Header';

interface VideoCallLayoutProps {
  thumbnailRow: React.ReactNode;
  mainFocusVideo: React.ReactNode;
  rightSidebar?: React.ReactNode;
  bottomControls: React.ReactNode;
  isChatOpen: boolean;
}

export const VideoCallLayout: React.FC<VideoCallLayoutProps> = ({ 
  thumbnailRow, 
  mainFocusVideo,
  rightSidebar,
  bottomControls,
  isChatOpen,
}) => {
  return (
    <div className="w-full h-screen flex flex-col bg-[#1A1C23] overflow-hidden text-white font-sans">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 overflow-y-auto">
          {/* Top: Small thumbnails */}
          {thumbnailRow}
          
          {/* Middle: Big Video */}
          {mainFocusVideo}
          
          {/* Bottom: Controls */}
          {bottomControls}
        </div>

        {/* Right Sidebar - Chat/History — toggleable */}
        {rightSidebar && isChatOpen && (
          <div className="h-full transition-all duration-300">
            {rightSidebar}
          </div>
        )}
      </div>
    </div>
  );
};
