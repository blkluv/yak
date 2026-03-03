import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Play, Square } from 'lucide-react';

export function SimpleAudioTest() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
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
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied');
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
      
      <div className="space-y-4">
        {!recording ? (
          <Button onClick={startRecording} className="w-full">
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
    </Card>
  );
}