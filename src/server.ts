import { routeAgentRequest, type Schedule } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks...

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const files = formData.getAll("files") as unknown[];
        const uploadedAttachments = [];

        if (!env.FILE_BUCKET) {
          console.error("R2 Bucket 'FILE_BUCKET' is not bound.");
          return new Response(
            "Server configuration error: R2 bucket not available.",
            { status: 500 }
          );
        }

        for (const file of files) {
          if (file instanceof File) {
            const fileId = generateId();
            const fileKey = `uploads/${fileId}/${file.name}`;

            await env.FILE_BUCKET.put(fileKey, file.stream() as any, {
              httpMetadata: { contentType: file.type },
            });

            const reqUrl = new URL(request.url);
            const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
            // During development, use ngrok or other services to get a public URL for the file
            // eg. baseUrl = https://123.ngrok-free.app
            const fileRetrievalUrl = `${baseUrl}/${fileKey}`;

            uploadedAttachments.push({
              name: file.name,
              contentType: file.type,
              url: fileRetrievalUrl,
            });
          }
        }
        return Response.json({ attachments: uploadedAttachments });
      } catch (error) {
        console.error("Error handling file upload:", error);
        return new Response("Failed to upload files.", { status: 500 });
      }
    }

    if (url.pathname.includes("/uploads/") && request.method === "GET") {
      try {
        const parts = url.pathname.split("/");
        if (parts.length < 4) {
          return new Response(
            "Invalid file path format. Expected /uploads/{id}/{filename}",
            { status: 400 }
          );
        }
        const fileId = parts[2];
        const fileName = decodeURIComponent(parts.slice(3).join("/"));
        const fileKey = `uploads/${fileId}/${fileName}`;

        if (!env.FILE_BUCKET) {
          console.error("R2 Bucket 'FILE_BUCKET' is not bound.");
          return new Response(
            "Server configuration error: R2 bucket not available.",
            { status: 500 }
          );
        }

        const object = await env.FILE_BUCKET.get(fileKey);

        if (object === null) {
          return new Response("File not found.", { status: 404 });
        }

        return new Response(object.body);
      } catch (error) {
        console.error("Error retrieving file:", error);
        return new Response("Failed to retrieve file.", { status: 500 });
      }
    }

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
