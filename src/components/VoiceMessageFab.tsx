import { Button } from "@/components/ui/button";
import { Mic, MicOff, Play, Pause, Trash2, Hash } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { uploadToBlossom, getBlossomServers } from "@/lib/blossom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNostr } from "@nostrify/react";
import { useQueryClient } from "@tanstack/react-query";
import { NostrEvent } from "@nostrify/nostrify";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface QueryData {
  pages: NostrEvent[][];
  pageParams: number[];
}

function parseHashtags(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => tag.length > 0);
}

export function VoiceMessageFab() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishVoice } = useNostrPublish();
  const queryClient = useQueryClient();

  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioBlobState, setAudioBlobState] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const MAX_RECORDING_TIME = 60;
  const [hashtags, setHashtags] = useState<string[]>([]);

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
    return () => clearInterval(timer);
  }, [isRecording]);

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
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunks, {
          type: recorder.mimeType || "audio/webm",
        });

        const url = URL.createObjectURL(blob);
        setAudioBlobState(blob);
        setPreviewUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      setPreviewUrl(null);
    } catch (error) {
      console.error(error);
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

  const handlePlayPause = () => {
    if (!previewUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDiscardRecording = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setAudioBlobState(null);
    setRecordingTime(0);
    setHashtags([]);
  };

  const handlePublishRecording = async () => {
    if (!audioBlobState || !user?.pubkey || !user.signer) return;

    try {
      const blossomServers = await getBlossomServers(nostr, user.pubkey);
      if (!blossomServers.length) {
        toast.error("No Blossom servers found");
        return;
      }

      const audioUrl = await uploadToBlossom(
        audioBlobState, // ✅ correct blob
        blossomServers,
        user.pubkey,
        user.signer
      );

      publishVoice(
        {
          kind: 1222,
          content: audioUrl,
          tags: hashtags.map((tag) => ["t", tag]),
        },
        {
          onSuccess: () => {
            toast.success("Voice message published");
            handleDiscardRecording();
          },
        }
      );
    } catch (error) {
      console.error(error);
      toast.error("Publishing failed");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          {previewUrl ? (
            <>
              <Button onClick={handleDiscardRecording}>
                <Trash2 />
              </Button>

              <Button onClick={handlePlayPause}>
                {isPlaying ? <Pause /> : <Play />}
              </Button>

              <Button onClick={handlePublishRecording}>
                Publish
              </Button>
            </>
          ) : (
            <Button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
            >
              {isRecording ? (
                <>
                  <MicOff /> {formatTime(recordingTime)}
                </>
              ) : (
                <Mic />
              )}
            </Button>
          )}
        </div>

        {previewUrl && (
          <audio controls src={previewUrl} className="w-64 mt-2" />
        )}
      </div>
    </>
  );
}