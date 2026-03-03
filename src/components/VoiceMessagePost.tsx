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

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayName = metadata?.name || message.pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const npub = nip19.npubEncode(message.pubkey);

  // ✅ FIX 1: Handle audio playback errors
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onerror = () => {
        console.error("Audio playback failed for:", message.content);
        setPlaybackError(true);
      };
    }
  }, [message.content]);

  // --------------------------------------------------
  // 🎤 RECORDING (WITH MIME TYPE DETECTION)
  // --------------------------------------------------

  const getSupportedMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log("Using mime type:", type);
        return type;
      }
    }
    return undefined; // Let browser decide
  };

  const handleStartRecording = async () => {
    if (!user) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      
      const recorder = new MediaRecorder(stream, options);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        // ✅ FIX 2: Preserve the original MIME type
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });

        console.log("✅ Recorded blob:", {
          type: blob.type,
          size: blob.size,
          chunks: chunks.length,
        });

        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(1000); // Collect in 1-second chunks
      setMediaRecorder(recorder);
      setIsRecording(true);
      
      toast.success("Recording started");
    } catch (err) {
      console.error("Recording failed:", err);
      toast.error("Microphone access failed");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);
      toast.success("Recording stopped");
    }
  };

  const handleDiscard = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // --------------------------------------------------
  // 🚀 PUBLISH WITH PROPER MIME TYPE
  // --------------------------------------------------

  const handlePublishReply = async () => {
    if (!previewUrl || !user?.pubkey || !user.signer) {
      toast.error("Please record first");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();

      // ✅ FIX 3: Don't modify the blob - preserve original MIME type
      console.log("📤 Uploading audio:", {
        type: blob.type,
        size: blob.size,
      });

      const blossomServers = await getBlossomServers(nostr, user.pubkey);

      const audioUrl = await uploadToBlossom(
        blob, // Use original blob, don't recreate
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
            toast.error("Publish failed");
            setIsProcessing(false);
          },
        }
      );
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Upload failed");
      setIsProcessing(false);
    }
  };

  // --------------------------------------------------
  // 🎧 AUDIO PLAYBACK WITH FALLBACK
  // --------------------------------------------------

  const renderAudioPlayer = () => {
    if (playbackError) {
      return (
        <div className="mt-2 p-2 bg-destructive/10 rounded">
          <p className="text-sm text-destructive">
            Audio format not supported. 
            <Button 
              variant="link" 
              className="ml-2 p-0 h-auto"
              onClick={() => window.open(message.content, '_blank')}
            >
              Download instead
            </Button>
          </p>
        </div>
      );
    }

    return (
      <div className="mt-2">
        <audio 
          controls 
          className="w-full" 
          ref={audioRef}
          preload="metadata"
        >
          <source src={message.content} type="audio/webm" />
          <source src={message.content} type="audio/mp4" />
          <source src={message.content} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <Card className="p-4">
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

          {/* ✅ FIXED AUDIO PLAYER */}
          {renderAudioPlayer()}

          <div className="mt-4 flex items-center gap-6">
            <Dialog
              open={isReplyDialogOpen}
              onOpenChange={setIsReplyDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Mic className="h-5 w-5" />
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Voice Reply</DialogTitle>
                </DialogHeader>

                {!previewUrl ? (
                  <div className="space-y-4">
                    <Button
                      onClick={
                        isRecording
                          ? handleStopRecording
                          : handleStartRecording
                      }
                      className="w-full"
                      variant={isRecording ? "destructive" : "default"}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="mr-2 h-4 w-4" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-4 w-4" />
                          Record Reply
                        </>
                      )}
                    </Button>
                    {isRecording && (
                      <p className="text-sm text-center text-muted-foreground">
                        Recording... Speak now
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <audio controls className="w-full">
                      <source src={previewUrl} />
                    </audio>

                    <div className="flex gap-2 mt-4">
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
                  </>
                )}
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="sm">
              <Heart className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="sm">
              <Zap className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}