import { NostrEvent } from "@nostrify/nostrify";
import { useAuthor } from "@/hooks/useAuthor";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, Zap, Mic, MicOff, Play, Trash2 } from "lucide-react";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { toast } from "sonner";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadToBlossom, getBlossomServers } from "@/lib/blossom";
import { nip19 } from "nostr-tools";
import { Link as RouterLink } from "react-router-dom";

interface ThreadedNostrEvent extends NostrEvent {
  replies: ThreadedNostrEvent[];
}

interface VoiceMessagePostProps {
  message: ThreadedNostrEvent;
}

export function VoiceMessagePost({ message }: VoiceMessagePostProps) {
  const author = useAuthor(message.pubkey);
  const metadata = author.data?.metadata;
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const durationIntervalRef = useRef<ReturnType<typeof setInterval>>();

  const displayName = metadata?.name || message.pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const npub = nip19.npubEncode(message.pubkey);

  // ============================================
  // AUDIO LOADING & FORMAT DETECTION
  // ============================================

  useEffect(() => {
    if (!message.content) {
      setPlaybackError(true);
      setIsAudioLoading(false);
      return;
    }

    setIsAudioLoading(true);
    setPlaybackError(false);

    // Try to load audio with multiple format attempts
    const loadAudio = async () => {
      try {
        // First, try to fetch the audio to check if it's accessible
        const response = await fetch(message.content, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`Audio not accessible: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        console.log('Audio content-type:', contentType);

        // Set the audio URL
        setAudioUrl(message.content);
        setIsAudioLoading(false);

      } catch (error) {
        console.error('Failed to load audio:', error);
        setPlaybackError(true);
        setIsAudioLoading(false);
      }
    };

    loadAudio();
  }, [message.content]);

  // ============================================
  // AUDIO PLAYBACK HANDLING
  // ============================================

  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;

    const audio = audioRef.current;

    const handleCanPlay = () => {
      console.log('Audio can play');
      setPlaybackError(false);
    };

    const handleError = (e: Event) => {
      console.error('Audio playback error:', e);
      setPlaybackError(true);
      
      // Try to get more error info
      const audio = e.target as HTMLAudioElement;
      const error = audio.error;
      if (error) {
        console.error('Audio error code:', error.code);
        console.error('Audio error message:', error.message);
      }
    };

    const handleLoadStart = () => {
      setIsAudioLoading(true);
    };

    const handleLoadedData = () => {
      setIsAudioLoading(false);
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadeddata', handleLoadedData);

    // Force load
    audio.load();

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [previewUrl]);

  // ============================================
  // AUDIO LEVEL METER
  // ============================================

  const setupAudioMeter = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(average / 255);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();

      return audioContext;
    } catch (error) {
      console.error('Failed to setup audio meter:', error);
      return null;
    }
  }, []);

  // ============================================
  // RECORDING FUNCTIONS
  // ============================================

  const handleStartRecording = async () => {
    if (!user) {
      toast.error("Please login first");
      return;
    }

    try {
      // Request microphone with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      
      // Setup audio level meter
      const audioContext = setupAudioMeter(stream);

      // Determine best MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ];

      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      console.log('Using MIME type:', selectedMimeType || 'browser default');

      // Create recorder with options
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType || undefined,
        audioBitsPerSecond: 128000,
      });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          console.log(`Chunk: ${event.data.size} bytes`);
        }
      };

      recorder.onstop = async () => {
        console.log(`Recording stopped. Total chunks: ${chunks.length}`);
        
        if (chunks.length === 0) {
          toast.error("No audio recorded");
          return;
        }

        // Combine chunks
        const blob = new Blob(chunks, { 
          type: selectedMimeType || 'audio/webm' 
        });

        console.log('Raw blob:', {
          size: blob.size,
          type: blob.type,
        });

        if (blob.size < 1000) { // Less than 1KB is probably empty
          toast.error("Recording too short");
          return;
        }

        // Create preview URL
        const url = URL.createObjectURL(blob);
        
        // Test the blob with an audio element
        const testAudio = new Audio(url);
        
        await new Promise((resolve, reject) => {
          testAudio.oncanplaythrough = resolve;
          testAudio.onerror = reject;
          
          // Set a timeout
          setTimeout(() => reject(new Error('Audio test timeout')), 3000);
        });

        console.log('Audio test passed');
        setPreviewUrl(url);

        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        if (audioContext) {
          await audioContext.close();
        }

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setAudioLevel(0);
      };

      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecording(true);

      setRecordingDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success("Recording started");

    } catch (err) {
      console.error("Recording failed:", err);
      toast.error(err instanceof Error ? err.message : "Could not access microphone");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  };

  const handleDiscard = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
    setRecordingDuration(0);
  };

  // ============================================
  // PUBLISH FUNCTIONS
  // ============================================

  const handlePublishReply = async () => {
    if (!previewUrl || !user?.pubkey || !user.signer) {
      toast.error("Please record first");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();

      console.log('Publishing blob:', {
        size: blob.size,
        type: blob.type,
      });

      if (blob.size < 1000) {
        throw new Error("Recording too short");
      }

      const blossomServers = await getBlossomServers(nostr, user.pubkey);
      
      const audioUrl = await uploadToBlossom(
        blob,
        blossomServers,
        user.pubkey,
        user.signer
      );

      publishEvent(
        {
          kind: 1222,
          content: audioUrl,
          tags: [
            ["e", message.id, "", "root"],
            ["e", message.id, "", "reply"],
            ["p", message.pubkey],
          ],
        },
        {
          onSuccess: () => {
            handleDiscard();
            setIsReplyDialogOpen(false);
            toast.success("Voice reply published");
            setIsProcessing(false);
          },
          onError: (error) => {
            console.error("Publish failed:", error);
            toast.error("Failed to publish");
            setIsProcessing(false);
          },
        }
      );

    } catch (error) {
      console.error("Upload failed:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
      setIsProcessing(false);
    }
  };

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderAudioPlayer = () => {
    if (isAudioLoading) {
      return (
        <div className="mt-2 p-4 bg-muted rounded-md text-center">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading audio...</p>
        </div>
      );
    }

    if (playbackError || !audioUrl) {
      return (
        <div className="mt-2 p-4 bg-destructive/10 rounded-md">
          <p className="text-sm text-destructive mb-2">Audio cannot be played in browser</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(message.content, '_blank')}
          >
            Download Audio File
          </Button>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <audio
          ref={audioRef}
          controls
          className="w-full"
          preload="metadata"
        >
          <source src={audioUrl} type="audio/webm" />
          <source src={audioUrl} type="audio/mp4" />
          <source src={audioUrl} type="audio/mpeg" />
          <source src={audioUrl} type="audio/ogg" />
          <source src={audioUrl} type="audio/wav" />
          Your browser does not support audio.
        </audio>
        <p className="text-xs text-muted-foreground mt-1">
          If audio doesn't play, try downloading
        </p>
      </div>
    );
  };

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start space-x-4">
        <RouterLink to={`/profile/${npub}`}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={profileImage} />
            <AvatarFallback>
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </RouterLink>

        <div className="flex-1">
          <div className="flex justify-between items-center">
            <span className="font-medium">{displayName}</span>
            <span className="text-sm text-muted-foreground">
              {new Date(message.created_at * 1000).toLocaleString()}
            </span>
          </div>

          {renderAudioPlayer()}

          <div className="mt-4 flex items-center gap-2">
            <Dialog
              open={isReplyDialogOpen}
              onOpenChange={setIsReplyDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Mic className="h-4 w-4 mr-1" />
                  Reply
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Voice Reply</DialogTitle>
                </DialogHeader>

                {!previewUrl ? (
                  <div className="space-y-4 py-4">
                    {isRecording && (
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Recording</span>
                          <span className="font-mono">{formatDuration(recordingDuration)}</span>
                        </div>
                        
                        {/* Audio level meter */}
                        <div className="space-y-1">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 transition-all duration-100"
                              style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-center">
                            {audioLevel > 0.05 
                              ? "🎤 Microphone working" 
                              : "🔴 Speak now - no audio detected"}
                          </p>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                      className="w-full h-12"
                      variant={isRecording ? "destructive" : "default"}
                      disabled={isProcessing}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="mr-2 h-5 w-5" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-5 w-5" />
                          Start Recording
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <audio controls className="w-full" src={previewUrl} />
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={handlePublishReply}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {isProcessing ? "Publishing..." : "Publish"}
                      </Button>
                      <Button
                        onClick={handleDiscard}
                        variant="destructive"
                        className="flex-1"
                        disabled={isProcessing}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Discard
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="sm">
              <Heart className="h-4 w-4 mr-1" />
              Like
            </Button>

            <Button variant="ghost" size="sm">
              <Zap className="h-4 w-4 mr-1" />
              Zap
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}