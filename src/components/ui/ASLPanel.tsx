import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tokenizeSentence, type SignToken } from '../../lib/aslWordMap';

interface ASLPanelProps {
  text: string;
}

const WORD_SIGN_MS = 1400;
const LETTER_MS    = 430;

type Frame =
  | { kind: 'sign';   word: string; url: string }
  | { kind: 'letter'; letter: string; word: string };

function buildFrames(tokens: SignToken[]): Frame[] {
  const frames: Frame[] = [];
  for (const token of tokens) {
    if (token.type === 'sign') {
      frames.push({ kind: 'sign', word: token.word, url: token.url });
    } else {
      for (const letter of token.letters) {
        frames.push({ kind: 'letter', letter, word: token.word });
      }
    }
  }
  return frames;
}

export const ASLPanel: React.FC<ASLPanelProps> = ({ text }) => {
  const [frames, setFrames]       = useState<Frame[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const scheduleNext = useCallback((snap: Frame[], idx: number, ms: number) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      const next = idx + 1;
      if (next >= snap.length) return;
      activeRef.current = next;
      setActiveIdx(next);
      scheduleNext(snap, next, snap[next].kind === 'sign' ? WORD_SIGN_MS : LETTER_MS);
    }, ms);
  }, []);

  useEffect(() => {
    clearTimer();
    if (!text) { setFrames([]); return; }
    const tokens = tokenizeSentence(text);
    const newFrames = buildFrames(tokens);
    activeRef.current = 0;
    setFrames(newFrames);
    setActiveIdx(0);
    if (newFrames.length > 1) {
      scheduleNext(newFrames, 0, newFrames[0].kind === 'sign' ? WORD_SIGN_MS : LETTER_MS);
    }
    return clearTimer;
  }, [text, scheduleNext]);

  const handleSignFail = useCallback((failedIdx: number, word: string) => {
    setFrames(prev => {
      const letters = word.split('').filter(c => /[a-z]/.test(c));
      const letterFrames: Frame[] = letters.map(l => ({ kind: 'letter', letter: l, word }));
      const updated = [
        ...prev.slice(0, failedIdx),
        ...letterFrames,
        ...prev.slice(failedIdx + 1),
      ];
      clearTimer();
      activeRef.current = failedIdx;
      setActiveIdx(failedIdx);
      if (updated.length > failedIdx) {
        scheduleNext(updated, failedIdx, LETTER_MS);
      }
      return updated;
    });
  }, [scheduleNext]);

  const current     = frames[activeIdx] ?? frames[0];
  const totalFrames = Math.min(frames.length, 40);

  return (
    <div className="flex flex-col" style={{ width: 160 }}>

      {/* ── Window header ── */}
      <div className="flex items-center justify-between bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-t-2xl border-t border-x border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold tracking-widest text-white/70 uppercase">
            ASL
          </span>
        </div>
        <span className="text-[9px] text-white/30 font-mono truncate max-w-[80px]">
          {current?.kind === 'sign' ? current.word : current?.word ?? ''}
        </span>
      </div>

      {/* ── Main display ── */}
      <div className="bg-black/70 backdrop-blur-md border-x border-b border-white/10 rounded-b-2xl flex flex-col items-center justify-center gap-2 p-3"
           style={{ minHeight: 140 }}>

        {!frames.length ? (
          <span className="text-white/20 text-xs text-center leading-tight">
            ASL signs<br/>appear here
          </span>
        ) : current?.kind === 'sign' ? (
          <SignFrame
            key={`sign-${activeIdx}-${current.url}`}
            frame={current}
            onFail={() => handleSignFail(activeIdx, current.word)}
          />
        ) : current ? (
          <LetterFrame
            key={`letter-${activeIdx}-${current.letter}`}
            frame={current}
          />
        ) : null}

        {/* Progress bar */}
        {totalFrames > 1 && (
          <div className="w-full flex gap-0.5 flex-wrap justify-center">
            {Array.from({ length: totalFrames }).map((_, i) => (
              <div
                key={i}
                className={`h-0.5 rounded-full transition-all duration-150 ${
                  i === activeIdx   ? 'flex-1 bg-white'      :
                  i < activeIdx     ? 'flex-1 bg-white/25'   :
                                      'flex-1 bg-white/8'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SignFrame: React.FC<{
  frame: Extract<Frame, { kind: 'sign' }>;
  onFail: () => void;
}> = ({ frame, onFail }) => {
  const [loaded, setLoaded] = useState(false);
  const isVideo = frame.url.endsWith('.mp4');

  return (
    <div className="flex flex-col items-center gap-1">
      {!loaded && (
        <div className="w-24 h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
      {isVideo ? (
        <video
          src={frame.url}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setLoaded(true)}
          onError={onFail}
          className={`object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0 absolute'}`}
          style={{ width: 96, height: 96 }}
        />
      ) : (
        <img
          src={frame.url}
          alt={frame.word}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={onFail}
          className={`object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0 absolute'}`}
          style={{ width: 96, height: 96 }}
        />
      )}
      <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wide">
        {frame.word}
      </span>
    </div>
  );
};

const LetterFrame: React.FC<{
  frame: Extract<Frame, { kind: 'letter' }>;
}> = ({ frame }) => (
  <div className="flex flex-col items-center gap-1">
    <img
      src={`/asl/${frame.letter}.gif`}
      alt={frame.letter}
      draggable={false}
      style={{ width: 80, height: 80 }}
      className="object-contain"
    />
    <div className="flex items-baseline gap-1">
      <span className="text-base font-bold text-white uppercase">{frame.letter}</span>
      <span className="text-[9px] text-white/35 normal-case">({frame.word})</span>
    </div>
  </div>
);
