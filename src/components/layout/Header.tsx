import React, { useState, useEffect } from 'react';
import { Monitor, Settings, Info, Users, Shield, Keyboard } from 'lucide-react';

export const Header = () => {
  const [time, setTime] = useState(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-app-bg border-b border-white/5 shadow-sm sticky top-0 z-50">
      
      {/* Left: Branding & Room Info */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary-accent flex items-center justify-center shadow-lg shadow-primary-accent/20">
          <Monitor className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-xl tracking-wide text-white">Voxta</span>
        </div>
        <div className="h-4 w-[1px] bg-white/10 mx-2" />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel-bg border border-white/5">
           <Shield className="w-4 h-4 text-green-400" />
           <span className="text-xs font-medium text-white/70">E2E Encrypted Room 04</span>
        </div>
      </div>

      {/* Right: Quick Tools & Status */}
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2">
           <IconButton icon={Users} tooltip="Participants" />
           <IconButton icon={Keyboard} tooltip="Keyboard Shortcuts" />
           <IconButton icon={Info} tooltip="Session Info" />
           <IconButton icon={Settings} tooltip="Settings" />
        </div>
        
        <div className="h-6 w-[1px] bg-white/10 mx-1 hidden md:block" />

        <div className="flex items-center gap-3">
           <span className="text-sm font-bold text-white tracking-widest bg-panel-bg px-3 py-1.5 rounded-lg border border-white/5 shadow-inner">
             {time}
           </span>
           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 border-2 border-app-bg shadow-md flex items-center justify-center">
             <span className="text-sm font-bold text-white shadow-sm">U</span>
           </div>
        </div>
      </div>
    </header>
  );
};

const IconButton = ({ icon: Icon, tooltip }: { icon: any, tooltip: string }) => (
  <button 
    className="relative p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors group"
    aria-label={tooltip}
  >
    <Icon className="w-5 h-5" />
    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap border border-white/10 pointe-events-none transition-opacity">
      {tooltip}
    </span>
  </button>
);
