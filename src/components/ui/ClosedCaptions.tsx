import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ClosedCaptionsProps {
  text: string;
  isTranslating?: boolean;
  className?: string;
}

const FADE_DELAY_MS = 4000; // auto-hide after 4s of no change

export const ClosedCaptions: React.FC<ClosedCaptionsProps> = ({
  text,
  isTranslating = false,
  className
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), FADE_DELAY_MS);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className={cn("w-[90%] md:w-[75%] max-w-2xl z-50 flex flex-col items-center pointer-events-none mx-auto", className)}>
      <AnimatePresence mode="popLayout">
        {visible && text && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.6 } }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-black/75 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-2.5 shadow-xl"
          >
            {isTranslating && (
              <div className="flex items-center gap-1.5 mb-1 text-primary-accent opacity-90">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-accent"></span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider">Translating...</span>
              </div>
            )}
            <p className="text-white text-base md:text-lg lg:text-xl font-medium tracking-tight leading-snug text-center">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
