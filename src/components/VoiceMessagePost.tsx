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
import { useState, useRef } from "react";
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

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayName = metadata?.name || message.pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const npub = nip19.npubEncode(message.pubkey);

  // --------------------------------------------------
  // 🎤 RECORDING (FORCE STABLE MIME)
  // --------------------------------------------------

  const handleStartRecording = async () => {
  if (!user) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    // ❌ DO NOT force mimeType on iOS
    const recorder = new MediaRecorder(stream);

    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks); // Let browser decide type

      console.log("Blob type:", blob.type);
      console.log("Blob size:", blob.size);

      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);

      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();

    setMediaRecorder(recorder);
    setIsRecording(true);
  } catch (err) {
    console.error(err);
    toast.error("Microphone failed");
  }
};
  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setIsRecording(false);
    }
  };

  const handleDiscard = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  // --------------------------------------------------
  // 🚀 PUBLISH
  // --------------------------------------------------

  const handlePublishReply = async () => {
    if (!previewUrl || !user?.pubkey || !user.signer) {
      toast.error("Please record first");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch(previewUrl);
      const rawBlob = await response.blob();

      const cleanBlob = new Blob([rawBlob], {
        type: rawBlob.type || "audio/mp4",
      });

      const blossomServers = await getBlossomServers(nostr, user.pubkey);

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
          ],
        },
        {
          onSuccess: () => {
            handleDiscard();
            setIsReplyDialogOpen(false);
            toast.success("Voice reply published");
            setIsProcessing(false);
          },
          onError: () => {
            toast.error("Publish failed");
            setIsProcessing(false);
          },
        }
      );
    } catch (error) {
      console.error(error);
      toast.error("Upload failed");
      setIsProcessing(false);
    }
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

          {/* 🔥 FIXED PLAYER */}
          <div className="mt-2">
            <audio controls className="w-full" ref={audioRef}>
              <source src={message.content} />
              Your browser does not support the audio element.
            </audio>
          </div>

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
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Mic className="mr-2 h-4 w-4" />
                        Record Reply
                      </>
                    )}
                  </Button>
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
                        Publish
                      </Button>

                      <Button
                        onClick={handleDiscard}
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