import { routeAgentRequest, type Schedule } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls } from "./utils";
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
   * @param onFinish - Callback function executed when streaming completes
   */

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.unstable_getAITools(),
    };

    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions,
        });

        // Stream the AI response using GPT-4
        const result = streamText({
          model,
          system: `You are a helpful assistant that can do various tasks...

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,
          messages: processedMessages,
          tools: allTools,
          onFinish: async (args) => {
            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
            // await this.mcp.closeConnection(mcpConnection.id);
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10,
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      },
    });

    return dataStreamResponse;
  }
  async executeTask(description: string, task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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
        success: hasOpenAIKey,
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
  },
} satisfies ExportedHandler<Env>;
