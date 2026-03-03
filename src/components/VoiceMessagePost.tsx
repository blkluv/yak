import { useState, useRef } from "react";
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

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [showReply, setShowReply] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlobState, setAudioBlobState] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ---------- RECORD ----------
  const handleStartRecording = async () => {
    if (!user) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });

      setAudioBlobState(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
    };

    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorder) {
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

  // ---------- PUBLISH ----------
  const handlePublishReply = async () => {
    if (!audioBlobState || !user?.pubkey || !user.signer) return;

    setIsProcessing(true);

    const blossomServers = await getBlossomServers(nostr, user.pubkey);
    if (!blossomServers.length) {
      toast.error("No blossom servers");
      return;
    }

    const audioUrl = await uploadToBlossom(
      audioBlobState,
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
          toast.success("Reply published");
          handleDiscard();
          setShowReply(false);
          setIsProcessing(false);
        },
        onError: () => {
          toast.error("Publish failed");
          setIsProcessing(false);
        },
      }
    );
  };

  return (
    <div className="space-y-3 border rounded-lg p-4">
      {/* Main Audio */}
      <audio
        ref={audioRef}
        src={message.content}
        controls
        className="w-full"
      />

      {/* Reply Button */}
      <button
        onClick={() => setShowReply((prev) => !prev)}
        className="text-sm text-blue-600"
      >
        Reply
      </button>

      {/* Reply Section */}
      {showReply && (
        <div className="space-y-2">
          {!previewUrl ? (
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className="bg-pink-500 text-white px-4 py-2 rounded"
            >
              {isRecording ? "Stop Recording" : "Record Reply"}
            </button>
          ) : (
            <>
              <audio src={previewUrl} controls className="w-full" />
              <div className="flex gap-2">
                <button
                  onClick={handlePublishReply}
                  disabled={isProcessing}
                  className="bg-green-500 text-white px-4 py-2 rounded"
                >
                  Publish
                </button>
                <button
                  onClick={handleDiscard}
                  className="bg-gray-400 px-4 py-2 rounded"
                >
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}