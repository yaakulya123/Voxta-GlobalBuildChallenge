import React, { useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender: string;
  time: string;
  text: string;
  isSelf: boolean;
}

interface SidebarProps {
  messages: ChatMessage[];
  onSendMessage?: (text: string) => void;
  onSummarize?: () => void;
  isSummarizing?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ messages, onSendMessage, onSummarize, isSummarizing }) => {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = React.useState("");

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim() && onSendMessage) {
      onSendMessage(inputText.trim());
      setInputText("");
    }
  };

  return (
    <aside className="w-[320px] xl:w-[380px] h-full flex flex-col bg-panel-bg border-l border-white/5">
      
      {/* Tabs */}
      <div className="p-4 border-b border-white/5">
        <div className="flex bg-app-bg rounded-xl p-1 mb-2">
          <button className="flex-1 py-2 text-sm font-medium rounded-lg text-white/60 hover:text-white transition-colors">
            Transcription
          </button>
          <button className="flex-1 py-2 text-sm font-medium rounded-lg bg-primary-accent text-white shadow-md">
            Chat
          </button>
        </div>
        <button 
          onClick={onSummarize} 
          disabled={isSummarizing || messages.length === 0}
          className="w-full py-2 bg-[#2B2E36] hover:bg-[#3A3D47] disabled:opacity-50 text-white rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors border border-white/5"
        >
          {isSummarizing ? "Summarizing..." : "Summarize Meeting"}
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}>
            <div className="flex items-baseline gap-2 mb-1 px-1">
              {!msg.isSelf && <span className="text-sm font-medium text-white/80">{msg.sender}</span>}
              {msg.isSelf && <span className="text-sm font-medium text-white/80">You</span>}
              <span className="text-[10px] text-white/40">{msg.time}</span>
            </div>
            <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
              msg.isSelf 
                ? 'bg-app-bg text-white rounded-tr-sm border border-white/5' 
                : 'bg-[#2B2E36] text-white rounded-tl-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/5 bg-panel-bg shrink-0">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..." 
            className="w-full bg-app-bg border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-primary-accent/50 transition-colors"
          />
          <button 
            onClick={handleSend}
            className="absolute right-2 w-8 h-8 bg-primary-accent hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

    </aside>
  );
};
