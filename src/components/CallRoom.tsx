import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { VideoCallLayout } from './layout/VideoCallLayout';
import { ThumbnailGrid } from './video/ThumbnailGrid';
import { FocusVideo } from './video/FocusVideo';
import { BottomControls } from './controls/BottomControls';
import { Sidebar, type ChatMessage } from './layout/Sidebar';
import { initSpeechRecognition } from '../lib/speechRecognition';
import { initGestureDetector, detectGesture } from '../lib/gestureDetector';
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

export default function CallRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') || 'hearing';
  const myName = searchParams.get('name') || (role === 'deaf' ? 'Deaf User' : 'Hearing User');
  const navigate = useNavigate();

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isCaptionsOn, setIsCaptionsOn] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isBlurOn, setIsBlurOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const [captionsText, setCaptionsText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const recognitionRef = useRef<any>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // WebRTC / Peer State
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerInfo, setPeerInfo] = useState<{name: string, role: string} | null>(null);
  const [status, setStatus] = useState('Connecting...');
  
  const localStreamRef = useRef<MediaStream | null>(null);

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

  // Master WebRTC setup
  useEffect(() => {
    let mounted = true;

    async function setup() {
      // Connect WS
      connect(roomId);

      onMessage(async (msg: any) => {
        if (!mounted) return;
        switch (msg.type) {
          case 'joined':
            setStatus('Peer joined — starting call');
            setPeerInfo({ name: msg.name, role: msg.role });
            send({ type: 'peer_info', room: roomId, name: myName, role });
            if (role === 'deaf') {
              initWebRTC(localStreamRef.current!, (s: MediaStream) => setRemoteStream(s), sendSignal);
              await createOffer();
            }
            break;
          case 'peer_info':
            setPeerInfo({ name: msg.name, role: msg.role });
            break;
          case 'offer':
            if (role === 'hearing') {
              initWebRTC(localStreamRef.current!, (s: MediaStream) => setRemoteStream(s), sendSignal);
            }
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
            if (msg.tokens && msg.tokens.length > 0) {
              const text = `[ASL Translated]: ${msg.tokens.join(" ")}`;
              setCaptionsText(text);
              addMessage(text, false, peerInfo?.name || 'Peer');
            }
            break;
          case 'spoken_text':
             setCaptionsText(msg.text);
             addMessage(msg.text, false, peerInfo?.name || 'Peer');
             break;
        }
      });

      send({ type: 'join', room: roomId, role, name: myName });
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
  }, [roomId, role, myName, sendSignal, peerInfo]);


  useEffect(() => {
    initGestureDetector();
  }, []);

  // Web Speech API Effect (Mic Toggle)
  useEffect(() => {
    if (isMicOn && isCaptionsOn) {
      const recognition = initSpeechRecognition((text, isFinal) => {
        setCaptionsText(text);
        if (isFinal && text.trim().length > 0) {
           addMessage(text, true);
           send({ type: 'spoken_text', room: roomId, text });
        }
      });
      if (recognition) {
        recognition.onend = () => {
           try { recognition.start(); } catch (e) {}
        };
        try { recognition.start(); } catch (e) {}
        recognitionRef.current = recognition;
      }
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

  // MediaPipe Local Gesture Loop
  useEffect(() => {
    let animationFrameId: number;

    const gestureLoop = () => {
      if (isVideoOn && isCaptionsOn && webcamRef.current?.video) {
        const tokens = detectGesture(webcamRef.current.video);
        if (tokens.length > 0) {
          setIsTranslating(true);
          const message = `[ASL Translated]: ${tokens.join(" ")}`;
          setCaptionsText(message);
          addMessage(message, true);
          send({ type: 'asl_gloss', room: roomId, tokens });
          
          setTimeout(() => {
            setIsTranslating(false);
            setCaptionsText("");
          }, 3000);
        }
      }
      animationFrameId = requestAnimationFrame(gestureLoop);
    };

    animationFrameId = requestAnimationFrame(gestureLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isVideoOn, isCaptionsOn, roomId]);

  // Vision Pipeline (OpenRouter Backend loop)
  useEffect(() => {
    if (!isVideoOn) return;
    
    const visionInterval = setInterval(() => {
      if (webcamRef.current) {
         const imageSrc = webcamRef.current.getScreenshot();
         if (imageSrc) {
            const base64 = imageSrc.split(',')[1];
            send({ type: 'video_frame', room: roomId, frame_b64: base64 });
            setIsTranslating(true);
            setTimeout(() => setIsTranslating(false), 800);
         }
      }
    }, 4500);

    return () => clearInterval(visionInterval);
  }, [isVideoOn, roomId]);


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
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }]
        })
      });
      
      const data = await response.json();
      let summary = data.choices[0]?.message?.content || "Could not generate summary.";
      // Strip any remaining markdown formatting
      summary = summary.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '').replace(/__/g, '');
      addMessage(`Meeting Summary:\n${summary}`, false, "System");
    } catch(e) {
      console.log(e);
      addMessage("Failed to fetch summary from OpenRouter.", false, "System");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Screen sharing handler
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Switch back to webcam track
      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        if (camTrack) {
          try { replaceVideoTrack(camTrack); } catch (e) {}
        }
      }
      setIsScreenSharing(false);
    } else {
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace the video track in the WebRTC peer connection
        try { replaceVideoTrack(screenTrack); } catch (e) {}
        
        // When user clicks "Stop sharing" via browser UI
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
    // Clean up screen share if active
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
      thumbnailRow={<ThumbnailGrid isLocalVideoOn={isVideoOn} isBlurOn={isBlurOn} webcamRef={webcamRef} peerStream={remoteStream} peerInfo={peerInfo} />}
      mainFocusVideo={
        <FocusVideo 
          name={peerInfo ? `${peerInfo.name} (${peerInfo.role})` : "Waiting for peer..."} 
          isSpeaking={false} 
          captionsText={captionsText}
          isTranslating={isTranslating}
          stream={remoteStream}
        />
      }
      rightSidebar={<Sidebar 
          messages={messages} 
          onSendMessage={(text: string) => {
             addMessage(text, true);
             send({ type: 'chat', room: roomId, sender: myName, text });
          }} 
          onSummarize={handleSummarize}
          isSummarizing={isSummarizing}
      />}
      bottomControls={
        <BottomControls 
          isMicOn={isMicOn}
          isVideoOn={isVideoOn}
          isChatOpen={isChatOpen}
          isBlurOn={isBlurOn}
          isScreenSharing={isScreenSharing}
          onToggleMic={() => setIsMicOn(!isMicOn)}
          onToggleVideo={() => setIsVideoOn(!isVideoOn)}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          onToggleBlur={() => setIsBlurOn(!isBlurOn)}
          onToggleScreenShare={handleToggleScreenShare}
          onLeave={onLeave}
        />
      }
    />
  );
}
