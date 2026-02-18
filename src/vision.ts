// ── Image pre-processing ─────────────────────────────────────────────
//
// The primary chat model (GLM) doesn't support image inputs directly.
// These helpers run image parts through a separate vision model and
// replace them with text descriptions before the chat model sees them.
//
// Images are stored in R2 with their descriptions cached in custom
// metadata, so the vision model only runs once per unique image.
//
// >>> If you switch to a model that supports images natively (e.g.
// >>> openai("gpt-4o") or anthropic("claude-sonnet-4-20250514")),
// >>> you can delete this file entirely and pass modelMessages
// >>> straight to streamText in server.ts.

import { generateText, type ModelMessage } from "ai";

function r2KeyFromUrl(data: unknown): string {
  const url = typeof data === "string" ? data : "";
  if (url.startsWith("files/")) return url.slice("files/".length);
  if (url.startsWith("/files/")) return url.slice("/files/".length);
  return "";
}

export async function describeImageParts(
  messages: ModelMessage[],
  visionModel: Parameters<typeof generateText>[0]["model"],
  bucket: R2Bucket
): Promise<ModelMessage[]> {
  return Promise.all(
    messages.map(async (msg) => {
      if (msg.role !== "user" || typeof msg.content === "string") return msg;

      const imageParts = msg.content.filter(
        (p) => p.type === "file" && p.mediaType?.startsWith("image/")
      );
      if (imageParts.length === 0) return msg;

      const userText = msg.content
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ");

      const descriptions = await Promise.all(
        imageParts.map(async (img) => {
          if (img.type !== "file") return "";
          const r2Key = r2KeyFromUrl(img.data);
          if (!r2Key) return "[Unknown image]";

          // Single R2 get — returns both body and metadata in one call.
          // If we already have a cached description, return it immediately
          // without reading the body.
          const obj = await bucket.get(r2Key);
          if (!obj) return "[Image not found]";
          if (obj.customMetadata?.description) {
            return obj.customMetadata.description;
          }

          // No cached description — run the vision model.
          const imageBuffer = await obj.arrayBuffer();

          // Workers AI vision models expect { type: "image", image: ArrayBuffer }
          // with the prompt in a system message (see cloudflare/ai demos/vision).
          const { text } = await generateText({
            model: visionModel,
            messages: [
              {
                role: "system",
                content: userText
                  ? `The user said: "${userText}". Describe the image in that context.`
                  : "Describe this image concisely."
              },
              {
                role: "user",
                content: [{ type: "image", image: imageBuffer }]
              }
            ]
          });

          // Write back once with the description in metadata. R2 doesn't
          // support metadata-only updates, so we re-upload the body too.
          await bucket.put(r2Key, imageBuffer, {
            httpMetadata: obj.httpMetadata,
            customMetadata: {
              ...obj.customMetadata,
              description: text
            }
          });

          return text;
        })
      );

      return {
        ...msg,
        content: [
          ...msg.content.filter(
            (p) => !(p.type === "file" && p.mediaType?.startsWith("image/"))
          ),
          ...descriptions.map((d) => ({
            type: "text" as const,
            text: `[Attached image: ${d}]`
          }))
        ]
      };
    })
  );
}
