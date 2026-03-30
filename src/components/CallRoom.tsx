import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { VideoCallLayout } from './layout/VideoCallLayout';
import { ThumbnailGrid } from './video/ThumbnailGrid';
import { FocusVideo } from './video/FocusVideo';
import { BottomControls } from './controls/BottomControls';
import { Sidebar, type ChatMessage } from './layout/Sidebar';
import { initSpeechRecognition } from '../lib/speechRecognition';
import { initGestureDetector, detectGesture, setRecordTriggerCallback, captureLandmarks, flushLetterBuffer, getLetterBuffer, type Landmark } from '../lib/gestureDetector';
import { connect, send, onMessage, disconnect } from '../lib/socket.js';
import {
  init as initWebRTC,
  createOffer,
  handleOffer,
  handleAnswer,
  addIce,
  replaceVideoTrack,
  close as closeRTC,
} from '../lib/webrtc.js';

const MAX_RECORDING_MS = 8000;
const FRAME_INTERVAL_MS = 200; // capture a frame every 200ms while recording

export default function CallRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const myName = searchParams.get('name') || 'User';
  const navigate = useNavigate();

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isCaptionsOn, setIsCaptionsOn] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isBlurOn, setIsBlurOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [captionsText, setCaptionsText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [aslText, setAslText] = useState("");
  const webcamRef = useRef<Webcam>(null);
  const recognitionRef = useRef<any>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // WebRTC / Peer State
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerInfo, setPeerInfo] = useState<{name: string, role: string} | null>(null);
  const peerInfoRef = useRef<{name: string, role: string} | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const localStreamRef = useRef<MediaStream | null>(null);

  // Sign recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState(MAX_RECORDING_MS / 1000);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const capturedFramesRef = useRef<string[]>([]);
  const capturedLandmarksRef = useRef<Landmark[][]>([]);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false); // always-current ref for use in closures

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'sys', sender: 'System', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), text: `Room ${roomId} initialized.`, isSelf: false }
  ]);

  const addMessage = (text: string, isSelf: boolean, senderName?: string) => {
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, sender: isSelf ? 'You' : (senderName || 'Peer'), time, text, isSelf }]);
  };

  const sendSignal = useCallback((msg: any) => {
    send({ ...msg, room: roomId });
  }, [roomId]);

  // ── Master WebRTC setup ────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function setup() {
      connect(roomId);

      onMessage(async (msg: any) => {
        if (!mounted) return;
        switch (msg.type) {
          case 'joined':
            setStatus('Peer joined — starting call');
            peerInfoRef.current = { name: msg.name };
            setPeerInfo({ name: msg.name, role: '' });
            send({ type: 'peer_info', room: roomId, name: myName });
            // First person to see a peer join initiates the call
            initWebRTC(localStreamRef.current!, (s: MediaStream) => setRemoteStream(s), sendSignal);
            await createOffer();
            break;
          case 'peer_info':
            peerInfoRef.current = { name: msg.name };
            setPeerInfo({ name: msg.name, role: '' });
            break;
          case 'offer':
            initWebRTC(localStreamRef.current!, (s: MediaStream) => setRemoteStream(s), sendSignal);
            await handleOffer(msg.sdp);
            setStatus('Connected');
            break;
          case 'answer':
            await handleAnswer(msg.sdp);
            setStatus('Connected');
            break;
          case 'ice':
            await addIce(msg.candidate);
            break;
          case 'chat':
            addMessage(msg.text, false, msg.sender);
            break;
          case 'asl_gloss':
            // Raw token fallback (used by legacy single-frame flow)
            if (msg.tokens && msg.tokens.length > 0) {
              const text = msg.tokens.join(" ");
              setCaptionsText(text);
              addMessage(text, false, peerInfoRef.current?.name || 'Peer');
              setIsTranslating(true);
              setTimeout(() => setIsTranslating(false), 3000);
            }
            break;
          case 'translated_sentence':
            // Natural English sentence from the recorded clip pipeline
            if (msg.sentence) {
              setCaptionsText(msg.sentence);
              addMessage(msg.sentence, false, peerInfo?.name || 'Peer');
              setIsTranslating(true);
              setTimeout(() => setIsTranslating(false), 4000);
            }
            break;
          case 'clip_result':
            if (msg.status === 'ok' && msg.sentence) {
              // Deaf person sees confirmation of what was sent
              setCaptionsText(`Sent: "${msg.sentence}"`);
              addMessage(`You signed: "${msg.sentence}"`, true);
              setTimeout(() => setCaptionsText(""), 3000);
            } else if (msg.status === 'unclear') {
              setCaptionsText("No clear sign detected — try again");
              setTimeout(() => setCaptionsText(""), 2500);
            }
            break;
          case 'spoken_text':
            setCaptionsText(msg.text);
            addMessage(msg.text, false, peerInfoRef.current?.name || 'Peer');
            setAslText(msg.text);
            setTimeout(() => setAslText(""), msg.text.length * 450 + 2000);
            break;
          case 'tts_audio': {
            // Play translated audio for the hearing peer
            const audio = new Audio(`data:audio/mp3;base64,${msg.audio_b64}`);
            audio.play().catch(e => console.error('[TTS] play error', e));
            break;
          }
        }
      });

      send({ type: 'join', room: roomId, name: myName });
      setStatus('Waiting for peer...');
    }

    const pollDevice = setInterval(() => {
      if (webcamRef.current && webcamRef.current.stream) {
        localStreamRef.current = webcamRef.current.stream;
        clearInterval(pollDevice);
        setup();
      }
    }, 500);

    return () => {
      mounted = false;
      clearInterval(pollDevice);
      disconnect();
      closeRTC();
    };
  }, [roomId, myName, sendSignal]);

  // ── MediaPipe init (for gesture hold-trigger only) ─────────────────────
  useEffect(() => {
    initGestureDetector();
  }, []);

  // ── Real-time ASL detection + hold-to-record trigger ──────────────────
  useEffect(() => {
    let animationFrameId: number;
    let bufferCheckInterval: ReturnType<typeof setInterval>;

    const emitTokens = (tokens: string[]) => {
      if (tokens.length === 0) return;
      setIsTranslating(true);
      const text = tokens.join(' ');
      setCaptionsText(text);
      addMessage(`[ASL]: ${text}`, true);
      // Send through gloss pipeline → Claude NLP → TTS for hearing peer
      send({ type: 'gloss', room: roomId, tokens });
      setTimeout(() => { setIsTranslating(false); setCaptionsText(''); }, 3000);
    };

    const gestureLoop = () => {
      if (webcamRef.current?.video) {
        // detectGesture handles both: real-time ASL classification AND hold-to-record
        const tokens = detectGesture(webcamRef.current.video);
        if (tokens.length > 0 && !isRecordingRef.current) {
          emitTokens(tokens);
        }

        // Show live spelling buffer
        if (!isRecordingRef.current) {
          const buffer = getLetterBuffer();
          if (buffer.length > 0) {
            setCaptionsText(`Spelling: ${buffer}_`);
          }
        }
      }
      animationFrameId = requestAnimationFrame(gestureLoop);
    };

    // Periodically flush letter buffer into words
    bufferCheckInterval = setInterval(() => {
      if (!isRecordingRef.current) {
        const flushed = flushLetterBuffer();
        if (flushed.length > 0) emitTokens(flushed);
      }
    }, 500);

    animationFrameId = requestAnimationFrame(gestureLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(bufferCheckInterval);
    };
  }, [roomId]);

  // ── Web Speech API (all users — captions + relay to peers) ──
  useEffect(() => {
    if (isMicOn && isCaptionsOn) {
      const recognition = initSpeechRecognition((text, isFinal) => {
        setCaptionsText(text);
        if (isFinal && text.trim().length > 0) {
          addMessage(text, true);
          send({ type: 'spoken_text', room: roomId, text });
          console.log('[Speech] sent:', text);
        }
      });
      if (!recognition) {
        console.error('[Speech] Web Speech API not supported — use Chrome');
        return;
      }
      recognition.onerror = (e: any) => {
        console.error('[Speech] error:', e.error);
        // auto-restart on non-fatal errors
        if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed') {
          try { recognition.start(); } catch (_) {}
        }
      };
      recognition.onend = () => {
        try { recognition.start(); } catch (_) {}
      };
      try { recognition.start(); } catch (e) { console.error('[Speech] start failed:', e); }
      recognitionRef.current = recognition;
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setCaptionsText("");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [isMicOn, isCaptionsOn, roomId]);

  // ── Recording: stop helper ─────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop(); // triggers onstop → sends frames
    }
  }, []);

  // ── Recording: start helper ────────────────────────────────────────────
  const startRecording = useCallback(() => {
    const stream = webcamRef.current?.stream;
    if (!stream || isRecordingRef.current) return;

    isRecordingRef.current = true;
    setIsRecording(true);
    capturedFramesRef.current = [];
    capturedLandmarksRef.current = [];

    // Set up frame capture canvas (reused across frames)
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;

    // Capture landmarks + JPEG frame every FRAME_INTERVAL_MS
    frameIntervalRef.current = setInterval(() => {
      const videoEl = webcamRef.current?.video;
      if (!videoEl || videoEl.readyState < 2) {
        console.warn('[Record] video not ready, skipping frame', videoEl?.readyState);
        return;
      }
      // Primary: MediaPipe landmarks (tiny, precise, motion-aware)
      const lm = captureLandmarks();
      if (lm) {
        capturedLandmarksRef.current.push(lm);
      }
      // Fallback: JPEG frame (used only if landmarks unavailable)
      ctx.drawImage(videoEl, 0, 0, 320, 240);
      const frame = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      capturedFramesRef.current.push(frame);
      console.log(`[Record] frame ${capturedFramesRef.current.length} | landmarks ${capturedLandmarksRef.current.length}`);
    }, FRAME_INTERVAL_MS);

    // Countdown display
    let secondsLeft = MAX_RECORDING_MS / 1000;
    setRecordingCountdown(secondsLeft);
    countdownIntervalRef.current = setInterval(() => {
      secondsLeft -= 1;
      setRecordingCountdown(secondsLeft);
    }, 1000);

    // Auto-stop after MAX_RECORDING_MS
    recordingTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);

    // We use MediaRecorder only to get a clean onstop signal
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.onstop = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
      setRecordingCountdown(MAX_RECORDING_MS / 1000);

      const landmarks = capturedLandmarksRef.current;
      const frames    = capturedFramesRef.current;

      const hasLandmarks = landmarks.length >= 5; // need enough frames to infer motion
      console.log(`[Record] landmarks=${landmarks.length} frames=${frames.length} → using ${hasLandmarks ? 'LANDMARKS' : 'JPEG fallback'}`);

      if (hasLandmarks || frames.length > 0) {
        setCaptionsText("Processing your sign...");
        setIsTranslating(true);

        if (hasLandmarks) {
          send({ type: 'landmark_clip', room: roomId, landmarks });
        } else {
          send({ type: 'video_clip', room: roomId, frames });
        }

        setTimeout(() => {
          setIsTranslating(false);
          setCaptionsText("");
        }, 10000);
      }
      capturedFramesRef.current = [];
      capturedLandmarksRef.current = [];
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
  }, [roomId, stopRecording]);

  // ── Recording: toggle (called from button and gesture hold) ───────────
  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  // Keep a stable ref so gesture callback always calls the latest version
  const toggleRecordingRef = useRef(toggleRecording);
  toggleRecordingRef.current = toggleRecording;

  useEffect(() => {
    setRecordTriggerCallback(() => toggleRecordingRef.current());
  }, []);

  // ── Summarizer ────────────────────────────────────────────────────────
  const [isSummarizing, setIsSummarizing] = useState(false);

  const handleSummarize = async () => {
    if (messages.length === 0) return;
    setIsSummarizing(true);
    addMessage("Agent: Generating meeting summary...", false, "System");

    try {
      const prompt = `Please summarize the following meeting notes and identify who said what. Keep it concise with bullet points using dashes (-). Do NOT use any markdown formatting, asterisks, or bold text. Return plain text only.\n\n${messages.map(m => `${m.sender}: ${m.text}`).join('\n')}`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5174",
          "X-Title": "Voxta"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      let summary = data.choices[0]?.message?.content || "Could not generate summary.";
      summary = summary.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '').replace(/__/g, '');
      addMessage(`Meeting Summary:\n${summary}`, false, "System");
    } catch(e) {
      console.log(e);
      addMessage("Failed to fetch summary from OpenRouter.", false, "System");
    } finally {
      setIsSummarizing(false);
    }
  };

  // ── Screen sharing ─────────────────────────────────────────────────────
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        if (camTrack) {
          try { replaceVideoTrack(camTrack); } catch (e) {}
        }
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        try { replaceVideoTrack(screenTrack); } catch (e) {}
        screenTrack.onended = () => {
          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack) {
              try { replaceVideoTrack(camTrack); } catch (e) {}
            }
          }
          screenStreamRef.current = null;
          setIsScreenSharing(false);
        };
        setIsScreenSharing(true);
      } catch (err) {
        console.log("Screen share cancelled or failed:", err);
      }
    }
  };

  const onLeave = () => {
    stopRecording();
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
    }
    disconnect();
    closeRTC();
    navigate('/');
  };

  return (
    <VideoCallLayout
      isChatOpen={isChatOpen}
      thumbnailRow={
        <ThumbnailGrid
          isLocalVideoOn={isVideoOn}
          isBlurOn={isBlurOn}
          webcamRef={webcamRef}
          peerStream={remoteStream}
          peerInfo={peerInfo}
          isRecording={isRecording}
        />
      }
      mainFocusVideo={
        <FocusVideo
          name={peerInfo ? peerInfo.name : "Waiting for peer..."}
          isSpeaking={false}
          captionsText={captionsText}
          isTranslating={isTranslating}
          stream={remoteStream}
          aslText={aslText}
        />
      }
      rightSidebar={
        <Sidebar
          messages={messages}
          onSendMessage={(text: string) => {
            addMessage(text, true);
            send({ type: 'chat', room: roomId, sender: myName, text });
          }}
          onSummarize={handleSummarize}
          isSummarizing={isSummarizing}
        />
      }
      bottomControls={
        <BottomControls
          isMicOn={isMicOn}
          isVideoOn={isVideoOn}
          isChatOpen={isChatOpen}
          isBlurOn={isBlurOn}
          isScreenSharing={isScreenSharing}
          isRecording={isRecording}
          recordingCountdown={recordingCountdown}
          onToggleMic={() => setIsMicOn(!isMicOn)}
          onToggleVideo={() => setIsVideoOn(!isVideoOn)}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          onToggleBlur={() => setIsBlurOn(!isBlurOn)}
          onToggleScreenShare={handleToggleScreenShare}
          onToggleRecord={toggleRecording}
          onLeave={onLeave}
        />
      }
    />
  );
}
