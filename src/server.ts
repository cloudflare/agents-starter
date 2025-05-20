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
  async addMcpServerFromChat(name: string, url: string, localUrl: string) {
    const mcpConnection = await this.addMcpServer(name, url, localUrl);
    return mcpConnection;
  }

  async removeMcpServerFromChat(id: string) {
    await this.removeMcpServer(id);
  }

  async getMcpConnections() {
    return this.mcp.mcpConnections;
  }

  async closeMcpConnection(id: string) {
    await this.closeMcpConnection(id);
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {

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

  async onRequest(request: Request): Promise<Response> {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.endsWith("add-mcp") && request.method === "POST") {
      const mcpServer = (await request.json()) as { url: string; name: string; localUrl?: string };
      const mcpConnection = await this.addMcpServerFromChat(mcpServer.name, mcpServer.url, mcpServer.localUrl || "");
      return new Response(JSON.stringify(mcpConnection), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (reqUrl.pathname.endsWith("get-mcp-connections") && request.method === "GET") {
      const mcpConnections = await this.getMcpConnections();
      return new Response(JSON.stringify({ mcpConnections }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (reqUrl.pathname.endsWith("get-mcp-servers") && request.method === "GET") {
      const mcpServers = await this.getConnections();
      return new Response(JSON.stringify({ mcpServers }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (reqUrl.pathname.endsWith("get-messages") && request.method === "GET") {
      // Return an empty array or your actual chat history
      return new Response(JSON.stringify(this.messages), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (reqUrl.pathname.endsWith("remove-mcp-connection") && request.method === "POST") {
      const { id } = (await request.json()) as { id: string };
      await this.removeMcpServerFromChat(id);
      return new Response("Ok", { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

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
