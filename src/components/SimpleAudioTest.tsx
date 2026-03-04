import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Play, Square, AlertCircle } from 'lucide-react';

export function SimpleAudioTest() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'denied' | 'granted'>('prompt');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const checkMicrophone = async () => {
    try {
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support microphone access');
        return false;
      }

      // Check if we're on HTTPS (required for microphone)
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        setError('Microphone access requires HTTPS. This site must be served over HTTPS.');
        return false;
      }

      // Try to get microphone with explicit error handling
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Success! Stop the stream immediately (we just wanted to check)
      stream.getTracks().forEach(track => track.stop());
      setPermissionState('granted');
      setError(null);
      return true;
      
    } catch (err: any) {
      console.error('Microphone error:', err);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
        setPermissionState('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No microphone found on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Microphone is busy or not available. Check if another app is using it.');
      } else {
        setError(`Microphone error: ${err.message || 'Unknown error'}`);
      }
      return false;
    }
  };

  const startRecording = async () => {
    setError(null);
    
    const hasMic = await checkMicrophone();
    if (!hasMic) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      
      const recorder = new MediaRecorder(stream);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };
      
      recorder.onerror = (e) => {
        setError('Recording failed: ' + e);
        stream.getTracks().forEach(t => t.stop());
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err: any) {
      setError('Failed to start recording: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return (
    <Card className="p-6 max-w-md mx-auto mt-10">
      <h2 className="text-xl font-bold mb-4">Simple Audio Test</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm flex items-start">
          <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {permissionState === 'denied' && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-700 text-sm">
          <p className="font-medium">Microphone access is blocked.</p>
          <p className="mt-1">To allow access:</p>
          <ul className="list-disc list-inside mt-1">
            <li>Click the 🔒 icon in your browser's address bar</li>
            <li>Find "Microphone" and change to "Allow"</li>
            <li>Refresh the page</li>
          </ul>
        </div>
      )}
      
      <div className="space-y-4">
        {!recording ? (
          <Button onClick={startRecording} className="w-full" disabled={permissionState === 'denied'}>
            <Mic className="mr-2 h-4 w-4" /> Start Recording
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
              a.download = 'test.webm';
              a.click();
            }}>
              <Play className="mr-2 h-4 w-4" /> Download Test
            </Button>
          </div>
        )}
      </div>
      
      <p className="text-xs text-gray-500 mt-4 text-center">
        Microphone status: {permissionState === 'granted' ? '✅ Allowed' : permissionState === 'denied' ? '❌ Blocked' : '⏳ Not requested'}
      </p>
    </Card>
  );
}
