import { NostrEvent } from "@nostrify/nostrify";
import { useAuthor } from "@/hooks/useAuthor";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Zap,
  Mic,
  MicOff,
  Play,
  Trash2,
  MoreVertical,
  Copy,
  Share2,
} from "lucide-react";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadToBlossom, getBlossomServers } from "@/lib/blossom";
import { nip19 } from "nostr-tools";
import { useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import { useNWC } from "@/hooks/useNWC";

interface ThreadedNostrEvent extends NostrEvent {
  replies: ThreadedNostrEvent[];
}

interface QueryData {
  pages: ThreadedNostrEvent[][];
  pageParams: number[];
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
  const queryClient = useQueryClient();
  const { sendZap, settings } = useNWC();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);

  const MAX_RECORDING_TIME = 60;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayName = metadata?.name || message.pubkey.slice(0, 8);
  const profileImage = metadata?.picture;

  // -----------------------------
  // Extract duration safely
  // -----------------------------
  useEffect(() => {
    if (!message.content) return;

    const audio = new Audio(message.content);

    audio.onloadedmetadata = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.onerror = () => {
      setDuration(null);
    };
  }, [message.content]);

  // -----------------------------
  // RECORDING TIMER
  // -----------------------------
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isRecording) {
      timer = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_RECORDING_TIME) {
            handleStopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  // -----------------------------
  // START RECORDING (Safari Safe)
  // -----------------------------
  const handleStartRecording = async () => {
    if (!user) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });

        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      toast.error("Microphone access failed");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const handleDiscardRecording = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordingTime(0);
  };

  // -----------------------------
  // PUBLISH REPLY (FIXED MIME)
  // -----------------------------
  const handlePublishReply = async () => {
    if (!previewUrl || !user?.pubkey || !user.signer) {
      toast.error("Record first");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(previewUrl);
      const audioBlob = await response.blob();

      const cleanBlob = new Blob([audioBlob], {
        type: audioBlob.type || "audio/webm",
      });

      const audio = new Audio(URL.createObjectURL(cleanBlob));

      const duration = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = reject;
      });

      const blossomServers = await getBlossomServers(nostr, user.pubkey);
      if (!blossomServers.length) throw new Error("No blossom servers");

      const audioUrl = await uploadToBlossom(
        cleanBlob,
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
            ["duration", Math.round(duration).toString()],
          ],
        },
        {
          onSuccess: () => {
            toast.success("Reply published");
            handleDiscardRecording();
            setIsReplyDialogOpen(false);
            setIsProcessing(false);
          },
          onError: () => {
            toast.error("Publish failed");
            setIsProcessing(false);
          },
        }
      );
    } catch (err) {
      toast.error("Failed to publish reply");
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start space-x-4">
        <RouterLink to="#">
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

          {/* AUDIO PLAYER (NO FORCED TYPE) */}
          <div className="mt-2">
            <audio
              controls
              className="w-full"
              ref={audioRef}
              src={message.content}
            />
          </div>

          {/* ACTIONS */}
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
                  <Button
                    onClick={
                      isRecording
                        ? handleStopRecording
                        : handleStartRecording
                    }
                    className="w-full"
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="mr-2 h-4 w-4" />
                        {recordingTime}s
                      </>
                    ) : (
                      <>
                        <Mic className="mr-2 h-4 w-4" />
                        Record
                      </>
                    )}
                  </Button>
                ) : (
                  <>
                    <audio
                      controls
                      src={previewUrl}
                      className="w-full"
                    />
                    <div className="flex gap-2 mt-4">
                      <Button
                        onClick={handlePublishReply}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Publish
                      </Button>
                      <Button
                        onClick={handleDiscardRecording}
                        variant="destructive"
                        className="flex-1"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Discard
                      </Button>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </Card>
  );
}