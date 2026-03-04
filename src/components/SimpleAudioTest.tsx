import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Play, Square, AlertCircle, Info } from 'lucide-react';

export function SimpleAudioTest() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string[]>([]);
  const [permissionState, setPermissionState] = useState<'prompt' | 'denied' | 'granted'>('prompt');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const addDebug = (message: string) => {
    setDebug(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 10));
  };

  const checkBrowserSupport = () => {
    const checks = [];
    
    // Check MediaRecorder
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser');
      return false;
    }
    checks.push('✅ MediaRecorder supported');
    
    // Check supported MIME types
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg;codecs=opus'
    ];
    
    const supported = types.filter(t => MediaRecorder.isTypeSupported(t));
    checks.push(`✅ Supported MIME types: ${supported.join(', ') || 'none'}`);
    
    if (supported.length === 0) {
      setError('No supported audio MIME types found in this browser');
      return false;
    }
    
    setDebug(checks);
    return true;
  };

  const checkMicrophone = async () => {
    try {
      addDebug('Checking microphone permission...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support microphone access');
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        } 
      });
      
      addDebug('✅ Microphone access granted');
      addDebug(`🎤 Audio tracks: ${stream.getAudioTracks().length}`);
      addDebug(`🎤 Track settings: ${JSON.stringify(stream.getAudioTracks()[0]?.getSettings() || {})}`);
      
      stream.getTracks().forEach(track => track.stop());
      setPermissionState('granted');
      setError(null);
      return true;
      
    } catch (err: any) {
      addDebug(`❌ Microphone error: ${err.name} - ${err.message}`);
      
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access.');
        setPermissionState('denied');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device.');
      } else {
        setError(`Microphone error: ${err.message}`);
      }
      return false;
    }
  };

  const startRecording = async () => {
    setError(null);
    setAudioUrl(null);
    chunksRef.current = [];
    
    // Check browser support first
    if (!checkBrowserSupport()) return;
    
    const hasMic = await checkMicrophone();
    if (!hasMic) return;

    try {
      addDebug('🎙️ Starting recording...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Find the best supported MIME type
      const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mpeg',
      ];
      
      let mimeType = '';
      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      addDebug(`📼 Using MIME type: ${mimeType || 'browser default'}`);
      
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          addDebug(`📦 Chunk received: ${e.data.size} bytes`);
        }
      };
      
      recorder.onstop = () => {
        addDebug(`⏹️ Recording stopped. Total chunks: ${chunksRef.current.length}`);
        
        if (chunksRef.current.length === 0) {
          setError('No audio data recorded');
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        const totalSize = chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
        addDebug(`📊 Total audio size: ${totalSize} bytes`);
        
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        addDebug(`💾 Final blob type: ${blob.type}, size: ${blob.size}`);
        
        if (blob.size < 100) {
          setError('Recording too short or empty');
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        addDebug(`✅ Recording ready for playback`);
        
        stream.getTracks().forEach(t => t.stop());
      };
      
      recorder.onerror = (e) => {
        addDebug(`❌ Recorder error: ${e}`);
        setError('Recording failed');
        stream.getTracks().forEach(t => t.stop());
      };
      
      // Request data every second
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      addDebug('🔴 Recording in progress...');
      
    } catch (err: any) {
      addDebug(`❌ Failed to start recording: ${err.message}`);
      setError('Failed to start recording: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      addDebug('⏹️ Stopping recording...');
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto mt-10">
      <h2 className="text-xl font-bold mb-4">🎤 Audio Diagnostic Test</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm flex items-start">
          <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {permissionState === 'denied' && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-700 text-sm">
          <p className="font-medium">🔇 Microphone access is blocked.</p>
          <p className="mt-1">Click the 🔒 icon in your address bar → Allow microphone → Refresh</p>
        </div>
      )}
      
      <div className="space-y-4">
        {!recording ? (
          <Button onClick={startRecording} className="w-full" disabled={permissionState === 'denied'}>
            <Mic className="mr-2 h-4 w-4" /> Start Recording Test
          </Button>
        ) : (
          <Button onClick={stopRecording} variant="destructive" className="w-full">
            <Square className="mr-2 h-4 w-4" /> Stop Recording
          </Button>
        )}
        
        {audioUrl && (
          <div className="space-y-2">
            <audio controls src={audioUrl} className="w-full" />
            <Button variant="outline" className="w-full" onClick={() => {
              const a = document.createElement('a');
              a.href = audioUrl;
              a.download = 'test-audio.webm';
              a.click();
            }}>
              <Play className="mr-2 h-4 w-4" /> Download Recording
            </Button>
          </div>
        )}
        
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Info className="h-4 w-4" />
            <span>Debug Log</span>
          </div>
          <div className="bg-black text-green-400 p-3 rounded font-mono text-xs h-48 overflow-y-auto">
            {debug.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all border-b border-gray-700 pb-1 mb-1">
                {line}
              </div>
            ))}
            {debug.length === 0 && (
              <div className="text-gray-500">Click "Start Recording" to see debug info...</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
