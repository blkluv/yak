import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, Play, Square, AlertCircle, Info, Upload } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostr } from '@nostrify/react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { uploadToBlossom, getBlossomServers } from '@/lib/blossom';
import { toast } from 'sonner';

export function SimpleAudioTest() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const addDebug = (message: string) => {
    console.log('[AudioTest]', message);
    setDebug(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 20));
  };

  const startRecording = async () => {
    setError(null);
    setAudioUrl(null);
    setAudioBlob(null);
    chunksRef.current = [];

    try {
      addDebug('Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      addDebug('✅ Microphone access granted');
      
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          addDebug(`📦 Chunk: ${e.data.size} bytes`);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioBlob(blob);
        addDebug(`✅ Recording complete: ${blob.size} bytes, type: ${blob.type}`);
        stream.getTracks().forEach(t => t.stop());
      };
      
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      addDebug('🔴 Recording started');
      
    } catch (err: any) {
      addDebug(`❌ Error: ${err.message}`);
      setError(err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      addDebug('⏹️ Recording stopped');
    }
  };

  const handlePublish = async () => {
    if (!audioBlob) {
      setError('No recording to publish');
      return;
    }

    if (!user?.pubkey) {
      setError('Please login first');
      return;
    }

    if (!user.signer) {
      setError('No signer available');
      return;
    }

    setIsPublishing(true);
    setError(null);
    addDebug('🚀 Starting publish process...');
    addDebug(`👤 User: ${user.pubkey.slice(0, 8)}...`);

    try {
      // Step 1: Get blossom servers
      addDebug('📡 Fetching blossom servers...');
      const servers = await getBlossomServers(nostr, user.pubkey);
      addDebug(`✅ Found ${servers.length} servers: ${servers.join(', ')}`);

      // Step 2: Upload to blossom
      addDebug('☁️ Uploading to blossom...');
      const audioUrl = await uploadToBlossom(
        audioBlob,
        servers,
        user.pubkey,
        user.signer
      );
      addDebug(`✅ Upload successful: ${audioUrl}`);

      // Step 3: Create and publish Nostr event
      addDebug('📨 Creating Nostr event...');
      publishEvent(
        {
          kind: 1222,
          content: audioUrl,
          tags: [],
        },
        {
          onSuccess: () => {
            addDebug('✅ Event published to Nostr!');
            toast.success('Voice message published');
            setIsPublishing(false);
          },
          onError: (error) => {
            addDebug(`❌ Publish failed: ${error}`);
            setError('Failed to publish to Nostr');
            setIsPublishing(false);
          },
        }
      );

    } catch (err: any) {
      addDebug(`❌ Upload failed: ${err.message}`);
      setError(err.message);
      setIsPublishing(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto mt-10">
      <h2 className="text-xl font-bold mb-4">🎤 Audio Publish Test</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {error}
        </div>
      )}
      
      <div className="space-y-4">
        <div className="flex gap-2">
          {!recording ? (
            <Button onClick={startRecording} className="flex-1" disabled={!user?.pubkey}>
              <Mic className="mr-2 h-4 w-4" /> Record
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive" className="flex-1">
              <Square className="mr-2 h-4 w-4" /> Stop
            </Button>
          )}
          
          {audioUrl && (
            <Button 
              onClick={handlePublish} 
              className="flex-1" 
              disabled={isPublishing || !user?.pubkey}
              variant="default"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isPublishing ? 'Publishing...' : 'Publish'}
            </Button>
          )}
        </div>
        
        {audioUrl && (
          <div className="space-y-2">
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}
        
        <div className="mt-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Info className="h-4 w-4" />
            <span>Debug Log</span>
            {!user?.pubkey && (
              <span className="text-yellow-600 text-xs ml-2">(Login required to publish)</span>
            )}
          </div>
          <div className="bg-black text-green-400 p-3 rounded font-mono text-xs h-64 overflow-y-auto">
            {debug.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all border-b border-gray-700 pb-1 mb-1">
                {line}
              </div>
            ))}
            {debug.length === 0 && (
              <div className="text-gray-500">Click Record to start...</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
