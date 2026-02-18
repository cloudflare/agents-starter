// ── Audio transcription ──────────────────────────────────────────────
//
// When users send voice recordings, this helper transcribes them using
// the AI SDK's transcribe() function with Workers AI's Whisper model,
// then replaces the audio file parts with text. Transcripts are cached
// in R2 custom metadata so each recording is only transcribed once.
//
// This mirrors the image pre-processing in vision.ts — same R2 cache
// pattern, different model type.

import {
  experimental_transcribe as transcribe,
  type ModelMessage,
  type TranscriptionModel
} from "ai";

const isAudioType = (t: string) => t.startsWith("audio/") || t === "video/webm";

function r2KeyFromUrl(data: unknown): string {
  const url = typeof data === "string" ? data : "";
  if (url.startsWith("files/")) return url.slice("files/".length);
  if (url.startsWith("/files/")) return url.slice("/files/".length);
  return "";
}

export async function transcribeAudioParts(
  messages: ModelMessage[],
  transcriptionModel: TranscriptionModel,
  bucket: R2Bucket
): Promise<ModelMessage[]> {
  return Promise.all(
    messages.map(async (msg) => {
      if (msg.role !== "user" || typeof msg.content === "string") return msg;

      const audioParts = msg.content.filter(
        (p) => p.type === "file" && isAudioType(p.mediaType)
      );
      if (audioParts.length === 0) return msg;

      const transcripts = await Promise.all(
        audioParts.map(async (part) => {
          if (part.type !== "file") return "";
          const r2Key = r2KeyFromUrl(part.data);
          if (!r2Key) return "[Unknown audio]";

          // Single R2 get — returns both body and metadata.
          const obj = await bucket.get(r2Key);
          if (!obj) return "[Audio not found]";
          if (obj.customMetadata?.transcript) {
            return obj.customMetadata.transcript;
          }

          // No cached transcript — run Whisper.
          const audioBuffer = await obj.arrayBuffer();

          const result = await transcribe({
            model: transcriptionModel,
            audio: new Uint8Array(audioBuffer)
          });
          const transcript = result.text || "[Could not transcribe]";

          // Write back once with the transcript in metadata.
          await bucket.put(r2Key, audioBuffer, {
            httpMetadata: obj.httpMetadata,
            customMetadata: {
              ...obj.customMetadata,
              transcript
            }
          });

          return transcript;
        })
      );

      return {
        ...msg,
        content: [
          ...msg.content.filter(
            (p) => !(p.type === "file" && isAudioType(p.mediaType))
          ),
          ...transcripts.map((t: string) => ({
            type: "text" as const,
            text: `[Voice message: ${t}]`
          }))
        ]
      };
    })
  );
}
