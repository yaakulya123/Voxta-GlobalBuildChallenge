import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ClosedCaptionsProps {
  text: string;
  isTranslating?: boolean;
  className?: string;
}

export const ClosedCaptions: React.FC<ClosedCaptionsProps> = ({ 
  text, 
  isTranslating = false,
  className 
}) => {
  return (
    <div className={cn("w-[90%] md:w-[80%] max-w-4xl z-50 flex flex-col items-center pointer-events-none mx-auto", className)}>
      <AnimatePresence mode="popLayout">
        {text && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 lg:px-10 lg:py-6 shadow-2xl"
          >
            {isTranslating && (
              <div className="flex items-center gap-2 mb-2 text-primary-accent opacity-90">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary-accent"></span>
                </span>
                <span className="text-xs font-medium uppercase tracking-wider">Detecting Sign Language...</span>
              </div>
            )}
            
            <p className="text-white text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight caption-shadow text-glow text-center">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
