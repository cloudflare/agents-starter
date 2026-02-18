import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet
} from "ai";
import { describeImageParts } from "./vision";
import { transcribeAudioParts } from "./audio";
import tools from "./tools";

// ── File handling config ─────────────────────────────────────────────

// Max upload size in bytes. Increase this if you need to support larger files.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Content types that can be served inline. Everything else is forced to
// download, preventing stored XSS via crafted Content-Type headers.
const SAFE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "application/pdf"
]);

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 200);
}

// ── Chat agent ───────────────────────────────────────────────────────

export class ChatAgent extends AIChatAgent<Env> {
  // ── HTTP routes (handled via onRequest) ──────────────────────────
  // These are called from the client using agentFetch, which constructs
  // the correct URL to this Durable Object instance. This means each
  // agent instance manages its own uploaded files.

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.split("/").slice(4).join("/"); // strip /agents/chat-agent/:name/

    // POST upload — store a file in R2 and return its URL.
    if (path === "upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return Response.json(
          { error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` },
          { status: 413 }
        );
      }

      const safeName = sanitizeFilename(file.name);
      const key = `uploads/${this.name}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}/${safeName}`;
      await this.env.R2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type }
      });

      // The URL is relative to this agent's HTTP base path.
      return Response.json({ key, url: `files/${key}` });
    }

    // POST delete-files — batch-delete R2 objects by key.
    // Called before clearing chat history so uploaded files don't
    // linger in R2 after the conversation is deleted.
    if (path === "delete-files" && request.method === "POST") {
      const { keys } = (await request.json()) as { keys: string[] };
      if (!Array.isArray(keys)) {
        return Response.json(
          { error: "Expected { keys: string[] }" },
          { status: 400 }
        );
      }
      const prefix = `uploads/${this.name}/`;
      const safeKeys = keys.filter(
        (k) => typeof k === "string" && k.startsWith(prefix)
      );
      if (safeKeys.length > 0) {
        await this.env.R2.delete(safeKeys);
      }
      return Response.json({ deleted: safeKeys.length });
    }

    // GET files-meta/:key — return R2 custom metadata (description, transcript).
    if (path.startsWith("files-meta/") && request.method === "GET") {
      const key = path.slice("files-meta/".length);
      if (!key.startsWith(`uploads/${this.name}/`)) {
        return new Response("Forbidden", { status: 403 });
      }
      const head = await this.env.R2.head(key);
      if (!head) {
        return Response.json({}, { status: 404 });
      }
      return Response.json(head.customMetadata ?? {});
    }

    // GET files/:key — serve a file from R2.
    if (path.startsWith("files/") && request.method === "GET") {
      const key = path.slice("files/".length);
      if (!key.startsWith(`uploads/${this.name}/`)) {
        return new Response("Forbidden", { status: 403 });
      }
      const obj = await this.env.R2.get(key);
      if (!obj) {
        return new Response("Not found", { status: 404 });
      }

      const contentType =
        obj.httpMetadata?.contentType || "application/octet-stream";
      const headers: Record<string, string> = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      };

      if (SAFE_CONTENT_TYPES.has(contentType)) {
        headers["Content-Type"] = contentType;
      } else {
        headers["Content-Type"] = "application/octet-stream";
        headers["Content-Disposition"] =
          `attachment; filename="${key.split("/").pop()}"`;
      }

      return new Response(obj.body, { headers });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Chat handling ────────────────────────────────────────────────

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    // Chat model — handles text, reasoning, and tool calls.
    // @ts-expect-error model not yet in workers-ai-provider type list
    const chatModel = workersai("@cf/zai-org/glm-4.7-flash");

    // Vision model — describes images so the text-only chat model can
    // understand them. Remove this (and the describeImageParts call)
    // if your chat model handles images natively.
    // @ts-expect-error model not yet in workers-ai-provider type list
    const visionModel = workersai("@cf/meta/llama-3.2-11b-vision-instruct");

    // Transcription model — converts voice recordings to text.
    const speechModel = workersai.transcription(
      // @ts-expect-error model not yet in workers-ai-provider type list
      "@cf/openai/whisper-large-v3-turbo"
    );

    // >>> To use a model that handles both text and images:
    // >>>   import { openai } from "@ai-sdk/openai";
    // >>>   const chatModel = openai("gpt-4o");
    // >>> Then delete visionModel and the describeImageParts call below.

    const modelMessages = await convertToModelMessages(this.messages);

    // Pre-process: convert non-text parts into text so the chat model
    // can understand them. Results are cached in R2 metadata.
    //   - Images → vision model description (see vision.ts)
    //   - Audio  → Whisper transcription (see audio.ts)
    const withImageDescriptions = await describeImageParts(
      modelMessages,
      visionModel,
      this.env.R2
    );
    const messages = await transcribeAudioParts(
      withImageDescriptions,
      speechModel,
      this.env.R2
    );

    const result = streamText({
      model: chatModel,
      system: `You are a helpful assistant. You can check the weather, get the user's timezone, run calculations, and schedule tasks.
When users share images, their descriptions are provided inline as [Attached image: ...]. When users send voice messages, their transcripts appear as [Voice message: ...]. Refer to these naturally.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages,
        toolCalls: "before-last-2-messages"
      }),
      // Tool definitions live in tools.ts — they use getCurrentAgent()
      // to access scheduling methods without needing a direct reference.
      tools,
      onFinish,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

// ── Worker fetch handler ─────────────────────────────────────────────
// All file routes are handled by ChatAgent.onRequest above.
// The Worker just routes requests to the appropriate agent instance.

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
