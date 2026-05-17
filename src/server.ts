import { createWorkersAI } from "workers-ai-provider";
import { Agent, callable, routeAgentRequest, type Schedule } from "agents";
import { agentTool } from "agents/agent-tools";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
  type UIMessage
} from "ai";
import { z } from "zod";

export const DEMO_USER = "demo-user";

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string;
}

export interface InboxState {
  chats: ChatSummary[];
}

type JsonSchema = Parameters<typeof z.fromJSONSchema>[0];

type McpToolDescriptor = {
  serverId: string;
  name: string;
  description?: string;
  title?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: { title?: string };
};

type McpCallToolResult = {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
};

function inputText(input: unknown): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const value = record.query ?? record.description;
    if (typeof value === "string") return value;
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

// Helper agents are retained agent-tool children. Their transcripts can be
// opened from the main chat UI as readonly drill-ins.
abstract class HelperAgent extends AIChatAgent<Env> {
  protected formatAgentToolInput(
    input: unknown,
    request: { runId: string }
  ): UIMessage {
    return {
      id: `agent-tool-${request.runId}-input`,
      role: "user",
      parts: [{ type: "text", text: inputText(input) }]
    };
  }

  protected abstract getSystemPrompt(): string;

  protected getTools(): ToolSet {
    return {};
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: this.getSystemPrompt(),
      messages: await convertToModelMessages(this.messages),
      tools: this.getTools(),
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export class Researcher extends HelperAgent {
  protected getSystemPrompt(): string {
    return [
      "You are a focused research helper agent.",
      "Investigate the user's topic, use `search_notes` for grounding,",
      "then finish with a concise summary the main assistant can use."
    ].join(" ");
  }

  protected getTools(): ToolSet {
    return {
      search_notes: tool({
        description:
          "Search simulated background notes for a topic. Replace this with a real search integration in production.",
        inputSchema: z.object({
          query: z.string().min(2)
        }),
        execute: async ({ query }) => ({
          query,
          results: [
            {
              title: `Background on ${query}`,
              snippet:
                "This starter helper demonstrates delegation to a retained subagent."
            },
            {
              title: `Implementation notes for ${query}`,
              snippet:
                "Keep child agents focused and return concise findings to the main chat."
            }
          ]
        })
      })
    };
  }
}

export class Planner extends HelperAgent {
  protected getSystemPrompt(): string {
    return [
      "You are a focused planning helper agent.",
      "Turn the user's request into a short implementation plan with concrete steps,",
      "risks, and validation notes."
    ].join(" ");
  }
}

export class Inbox extends Agent<Env, InboxState> {
  initialState: InboxState = { chats: [] };

  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS chat_meta (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_preview TEXT
    )`;

    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });

    this.refreshState();
  }

  override async onBeforeSubAgent(
    _request: Request,
    child: { className: string; name: string }
  ): Promise<Response | void> {
    // Only allow clients to open chat subagents that this inbox created.
    if (child.className !== "Chat") {
      return new Response(`Unknown subagent class: ${child.className}`, {
        status: 404
      });
    }
    if (!this.hasSubAgent(child.className, child.name)) {
      return new Response(`Chat "${child.name}" not found`, { status: 404 });
    }
  }

  private refreshState() {
    const registry = this.listSubAgents(Chat);
    const metaRows = this.sql<{
      id: string;
      title: string;
      updated_at: number;
      last_message_preview: string | null;
    }>`
      SELECT id, title, updated_at, last_message_preview FROM chat_meta
    `;
    const metaById = new Map(metaRows.map((row) => [row.id, row]));

    const chats: ChatSummary[] = registry
      .map((entry) => {
        const meta = metaById.get(entry.name);
        return {
          id: entry.name,
          title:
            meta?.title ??
            `Chat ${new Date(entry.createdAt).toISOString().slice(0, 10)}`,
          createdAt: entry.createdAt,
          updatedAt: meta?.updated_at ?? entry.createdAt,
          lastMessagePreview: meta?.last_message_preview ?? undefined
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    this.setState({ chats });
  }

  @callable()
  async createChat(opts?: { title?: string }): Promise<ChatSummary> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const title =
      opts?.title ?? `Chat ${new Date(now).toISOString().slice(0, 10)}`;

    await this.subAgent(Chat, id);
    this.sql`
      INSERT INTO chat_meta (id, title, updated_at, last_message_preview)
      VALUES (${id}, ${title}, ${now}, NULL)
    `;
    this.refreshState();
    return { id, title, createdAt: now, updatedAt: now };
  }

  @callable()
  async ensureChat(): Promise<ChatSummary> {
    const existing = this.state.chats[0];
    if (existing) return existing;
    return this.createChat();
  }

  @callable()
  async renameChat(id: string, title: string): Promise<void> {
    this.sql`
      INSERT INTO chat_meta (id, title, updated_at)
      VALUES (${id}, ${title}, ${Date.now()})
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
    `;
    this.refreshState();
  }

  @callable()
  async deleteChat(id: string): Promise<void> {
    await this.deleteSubAgent(Chat, id);
    this.sql`DELETE FROM chat_meta WHERE id = ${id}`;
    this.refreshState();
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string): Promise<void> {
    await this.removeMcpServer(serverId);
  }

  async listMcpToolDescriptors(
    timeoutMs = 5_000
  ): Promise<McpToolDescriptor[]> {
    await this.mcp.waitForConnections({ timeout: timeoutMs });
    return this.mcp.listTools() as McpToolDescriptor[];
  }

  async callMcpTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<McpCallToolResult> {
    return (await this.mcp.callTool({
      arguments: args,
      name,
      serverId
    })) as McpCallToolResult;
  }

  async recordChatTurn(chatId: string, preview: string): Promise<void> {
    this.sql`
      INSERT INTO chat_meta (id, title, updated_at, last_message_preview)
      VALUES (
        ${chatId},
        ${`Chat ${new Date().toISOString().slice(0, 10)}`},
        ${Date.now()},
        ${preview}
      )
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        last_message_preview = excluded.last_message_preview
    `;
    this.refreshState();
  }
}

// MCP servers are configured once on Inbox, then proxied into each Chat so all
// chats share the same external tool configuration.
class SharedMCPClient {
  #stubPromise?: Promise<DurableObjectStub<Inbox>>;

  constructor(private child: Pick<Chat, "parentAgent">) {}

  private parent(): Promise<DurableObjectStub<Inbox>> {
    this.#stubPromise ??= this.child.parentAgent(Inbox);
    return this.#stubPromise;
  }

  async getAITools(timeoutMs = 5_000): Promise<ToolSet> {
    const parent = await this.parent();
    const descriptors = (await parent.listMcpToolDescriptors(
      timeoutMs
    )) as McpToolDescriptor[];
    const entries: [string, ToolSet[string]][] = [];

    for (const descriptor of descriptors) {
      const toolKey = `tool_${descriptor.serverId.replace(/-/g, "")}_${descriptor.name}`;
      const { serverId, name, inputSchema, outputSchema } = descriptor;
      const title = descriptor.title ?? descriptor.annotations?.title;
      entries.push([
        toolKey,
        tool({
          description: descriptor.description,
          title,
          inputSchema: inputSchema
            ? z.fromJSONSchema(inputSchema)
            : z.fromJSONSchema({ type: "object" }),
          outputSchema: outputSchema
            ? z.fromJSONSchema(outputSchema)
            : undefined,
          execute: async (args) => {
            const result = await parent.callMcpTool(
              serverId,
              name,
              args as Record<string, unknown>
            );
            if (result.isError) {
              const firstText = result.content?.[0];
              throw new Error(
                firstText?.type === "text" && firstText.text
                  ? firstText.text
                  : "MCP tool call failed"
              );
            }
            return result;
          }
        })
      ]);
    }

    return Object.fromEntries(entries);
  }
}

export class Chat extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  private sharedMcp = new SharedMCPClient(this);

  private getInbox() {
    return this.parentAgent(Inbox);
  }

  override async onBeforeSubAgent(
    _request: Request,
    child: { className: string; name: string }
  ): Promise<Response | void> {
    // Drill-in is limited to helper agent runs that were created by agentTool.
    if (child.className !== "Researcher" && child.className !== "Planner") {
      return new Response(`Unknown helper agent class: ${child.className}`, {
        status: 404
      });
    }
    if (!this.hasAgentToolRun(child.className, child.name)) {
      return new Response(
        `Helper agent ${child.className}/${child.name} not found`,
        { status: 404 }
      );
    }
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = await this.sharedMcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a helpful assistant that can understand images. You can check the weather, get the user's timezone, run calculations, use shared MCP tools, delegate focused work to helper subagents, and schedule tasks. When users share images, describe what you see and answer questions about them.

Use the research helper for deeper background research. Use the planning helper when a user asks for implementation steps, migration plans, or trade-off analysis.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      messages: await convertToModelMessages(this.messages),
      tools: {
        ...mcpTools,

        research: agentTool(Researcher, {
          description:
            "Dispatch a Researcher helper agent for deeper background on a topic.",
          displayName: "Researcher",
          inputSchema: z.object({
            query: z.string().min(3)
          })
        }),

        plan: agentTool(Planner, {
          description:
            "Dispatch a Planner helper agent to create a concrete implementation or migration plan.",
          displayName: "Planner",
          inputSchema: z.object({
            description: z.string().min(5)
          })
        }),

        // Server-side tool: runs automatically on the server.
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production.
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function; the browser handles it.
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing.
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              await this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = await this.listSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              const cancelled = await this.cancelSchedule(taskId);
              return cancelled
                ? `Task ${taskId} cancelled.`
                : `Task ${taskId} was not found.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  protected async onChatResponse(): Promise<void> {
    const last = this.messages[this.messages.length - 1];
    if (!last) return;

    const preview = last.parts
      .filter((part): part is { type: "text"; text: string } => {
        return part.type === "text";
      })
      .map((part) => part.text)
      .join("")
      .slice(0, 120);

    try {
      const inbox = await this.getInbox();
      await inbox.recordChatTurn(this.name, preview);
    } catch (error) {
      console.warn("[Chat] Failed to update inbox preview:", error);
    }
  }

  @callable()
  async clearHelperRuns(): Promise<void> {
    await this.clearAgentToolRuns();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history, which would make the AI see the notification
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

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
