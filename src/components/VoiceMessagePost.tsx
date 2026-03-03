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
import { useState, useRef, useEffect } from "react";
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const durationIntervalRef = useRef<ReturnType<typeof setInterval>>();

  const displayName = metadata?.name || message.pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const npub = nip19.npubEncode(message.pubkey);

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

  // Handle audio playback errors
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onerror = () => {
        console.error("Audio playback failed");
        setPlaybackError(true);
      };
    }
  }, [message.content]);

  // ============================================
  // AUDIO LEVEL METER
  // ============================================

  const setupAudioMeter = (stream: MediaStream) => {
    const audioContext = new AudioContext();
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
      setAudioLevel(average / 255); // Normalize to 0-1
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  };

  // ============================================
  // RECORDING FUNCTIONS
  // ============================================

  const handleStartRecording = async () => {
    if (!user) {
      toast.error("Please login first");
      return;
    }

    try {
      // Request microphone with specific constraints for better quality
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
      setupAudioMeter(stream);

      // Determine best MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
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
        audioBitsPerSecond: 128000, // 128 kbps for good quality
      });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          console.log(`Chunk received: ${event.data.size} bytes`);
        }
      };

      recorder.onstop = () => {
        console.log(`Recording stopped. Total chunks: ${chunks.length}`);
        
        if (chunks.length === 0) {
          toast.error("No audio data recorded");
          return;
        }

        // Create blob with proper MIME type
        const blob = new Blob(chunks, { 
          type: selectedMimeType || 'audio/webm' 
        });

        console.log('Final blob:', {
          size: blob.size,
          type: blob.type,
          chunks: chunks.length,
        });

        if (blob.size < 100) {
          toast.error("Recording too short or no audio detected");
          return;
        }

        // Create preview URL
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);

        // Test playback
        const testAudio = new Audio(url);
        testAudio.oncanplaythrough = () => {
          console.log('Preview audio can play');
        };
        testAudio.onerror = (e) => {
          console.error('Preview audio error:', e);
          toast.error("Recording may be corrupted");
        };

        // Cleanup stream
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        // Stop audio meter
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        setAudioLevel(0);
      };

      recorder.start(1000); // Collect data every second
      setMediaRecorder(recorder);
      setIsRecording(true);

      // Start duration timer
      setRecordingDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.success("Recording started");

    } catch (err) {
      console.error("Failed to start recording:", err);
      toast.error("Could not access microphone");
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

      toast.success("Recording stopped");
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
      // Fetch the recorded blob
      const response = await fetch(previewUrl);
      const blob = await response.blob();

      console.log("Publishing audio:", {
        size: blob.size,
        type: blob.type,
      });

      if (blob.size < 100) {
        throw new Error("Recording too short or empty");
      }

      // Get blossom servers
      const blossomServers = await getBlossomServers(nostr, user.pubkey);
      console.log("Blossom servers:", blossomServers);

      // Upload to blossom
      const audioUrl = await uploadToBlossom(
        blob,
        blossomServers,
        user.pubkey,
        user.signer
      );

      console.log("Upload successful, URL:", audioUrl);

      // Publish to Nostr
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
    if (playbackError) {
      return (
        <div className="mt-2 p-3 bg-destructive/10 rounded-md">
          <p className="text-sm text-destructive">Audio format not supported</p>
          <Button
            variant="link"
            size="sm"
            className="mt-1"
            onClick={() => window.open(message.content, '_blank')}
          >
            Download instead
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
          onError={() => setPlaybackError(true)}
        >
          <source src={message.content} type="audio/webm" />
          <source src={message.content} type="audio/mp4" />
          <source src={message.content} type="audio/mpeg" />
          Your browser does not support audio.
        </audio>
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
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Recording...</span>
                          <span>{formatDuration(recordingDuration)}</span>
                        </div>
                        
                        {/* Audio level meter */}
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 transition-all duration-100"
                            style={{ width: `${audioLevel * 100}%` }}
                          />
                        </div>
                        
                        <p className="text-xs text-center text-muted-foreground">
                          {audioLevel > 0.1 
                            ? "🎤 Microphone working" 
                            : "🔴 Speak now - no audio detected"}
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                      className="w-full h-12"
                      variant={isRecording ? "destructive" : "default"}
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