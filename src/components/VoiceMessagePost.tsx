// 🔥 FULLY FIXED VoiceMessagePost (Recording + Reply Publishing Fixed)

import { useState, useEffect, useRef } from "react";
import { NostrEvent } from "@nostrify/nostrify";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostr } from "@nostrify/react";
import { uploadToBlossom, getBlossomServers } from "@/lib/blossom";
import { toast } from "sonner";

interface ThreadedNostrEvent extends NostrEvent {
  replies: ThreadedNostrEvent[];
}

interface Props {
  message: ThreadedNostrEvent;
}

export function VoiceMessagePost({ message }: Props) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();

  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [audioBlobState, setAudioBlobState] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 🎤 START RECORDING (Safari Safe)
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
        setAudioBlobState(blob);
        setPreviewUrl(url);

        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      toast.error("Microphone access failed");
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
    setAudioBlobState(null);
  };

  // 🚀 PUBLISH REPLY (FIXED)
  const handlePublishReply = async () => {
    if (!audioBlobState || !user?.pubkey || !user.signer) {
      toast.error("Please record first");
      return;
    }

    setIsProcessing(true);

    try {
      // Extract duration safely
      const audio = new Audio(URL.createObjectURL(audioBlobState));

      const duration = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject("timeout"), 5000);

        audio.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve(audio.duration);
        };

        audio.onerror = () => {
          clearTimeout(timeout);
          reject("audio load error");
        };
      });

      URL.revokeObjectURL(audio.src);

      const blossomServers = await getBlossomServers(nostr, user.pubkey);
      if (!blossomServers.length) throw new Error("No blossom servers");

      // ✅ Correct MIME type preserved
      const audioUrl = await uploadToBlossom(
        audioBlobState,
        blossomServers,
        user.pubkey,
        user.signer
      );

      const rootTag = message.tags.find(
        (t) => t[0] === "e" && t[3] === "root"
      );
      const rootId = rootTag ? rootTag[1] : message.id;

      publishEvent(
        {
          kind: 1222,
          content: audioUrl,
          tags: [
            ["e", rootId, "", "root"],
            ["e", message.id, "", "reply"],
            ["p", message.pubkey],
            ["duration", Math.round(duration).toString()],
          ],
        },
        {
          onSuccess: () => {
            toast.success("Reply published");
            handleDiscard();
            setIsProcessing(false);
          },
          onError: () => {
            toast.error("Publish failed");
            setIsProcessing(false);
          },
        }
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to publish");
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing audio */}
      <audio
        controls
        src={message.content}
        className="w-full"
        ref={audioRef}
      />

      {/* Reply recorder */}
      {!previewUrl ? (
        <button onClick={isRecording ? handleStopRecording : handleStartRecording}>
          {isRecording ? "Stop Recording" : "Record Reply"}
        </button>
      ) : (
        <>
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-2">
            <button onClick={handlePublishReply} disabled={isProcessing}>
              Publish Reply
            </button>
            <button onClick={handleDiscard}>Discard</button>
          </div>
        </>
      )}
    </div>
  );
}