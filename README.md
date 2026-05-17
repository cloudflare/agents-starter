# Agent Starter

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A starter template for building multi-chat AI agents on Cloudflare, powered by the [Agents SDK](https://developers.cloudflare.com/agents/), [AI SDK](https://ai-sdk.dev/), Workers AI, Durable Objects, React, and Kumo.

It is intentionally a launching point rather than a finished product: the app demonstrates common agent patterns you can keep, replace, or delete as your project takes shape.

## Quick Start

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
cd agents-starter
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the app.

Try these prompts:

- **"What's the weather in Paris?"** - server-side tool execution
- **"What timezone am I in?"** - client-side tool execution in the browser
- **"Calculate 5000 \* 3"** - human approval before tool execution
- **"Remind me in 5 minutes to take a break"** - scheduled task
- **"Research durable objects for chat apps"** - delegated helper agent
- **"Plan a migration to multi-chat"** - delegated planning helper
- **Drop an image and ask "What's in this image?"** - image input and vision

The starter uses Workers AI by default, so it runs without a model provider API key.

## Architecture

The app is organized as a small hierarchy of agents:

```txt
Inbox
  Chat
    Researcher
    Planner
```

### `Inbox`

`Inbox` is the root `Agent`. The browser connects to it with `useAgent`, and it owns app-level state:

- the list of chats
- chat metadata such as title, last preview, and updated time
- shared MCP server connections
- creation, deletion, and renaming of chat subagents

`Inbox` stores chat metadata in its SQLite-backed Durable Object storage and exposes callable methods such as `createChat`, `deleteChat`, `renameChat`, `addServer`, and `removeServer`.

### `Chat`

`Chat` is an `AIChatAgent`. Each chat thread is its own subagent under `Inbox`, so conversations have independent message history, tool calls, schedules, and helper runs.

`Chat` handles:

- streaming assistant responses
- image input
- server-side tools
- client-side tools
- approval tools
- scheduled tasks
- shared MCP tools from `Inbox`
- helper-agent tools such as `research` and `plan`

### `Researcher` and `Planner`

`Researcher` and `Planner` are helper agents exposed to the main chat through `agentTool`. They are retained subagents, so the UI can show their run state inline and open a readonly drill-in panel with the helper transcript.

The helpers are deliberately simple:

- `Researcher` has a simulated `search_notes` tool you can replace with real search.
- `Planner` turns a request into concrete implementation steps, risks, and validation notes.

Use them as examples for building your own focused agents.

## Project Structure

```txt
src/
  server.ts              # Agent classes, tools, shared MCP bridge, scheduling
  app.tsx                # React app shell and chat sidebar
  client.tsx             # React entry point
  constants.ts           # Shared demo constants
  styles.css             # Tailwind + Kumo styles
  components/
    active-chat.tsx      # Chat pane, message list, composer, attachments
    mcp-panel.tsx        # Shared MCP server controls
    tool-views.tsx       # Tool cards, helper runs, readonly drill-in UI

wrangler.jsonc # Worker, assets, AI binding, and Durable Object config
env.d.ts       # Generated Cloudflare binding types
```

## What's Included

- **Multi-chat UI** - create, switch, rename, and delete independent chat threads.
- **Streaming chat** - responses powered by Workers AI via `AIChatAgent`.
- **Helper agents** - delegate focused work to retained `Researcher` and `Planner` subagents.
- **Readonly drill-in** - inspect helper-agent transcripts without confusing them with the main chat.
- **Shared MCP** - configure MCP servers once on `Inbox`; every `Chat` can use their tools.
- **Image input** - drag, paste, or click to attach images for vision-capable models.
- **Tool patterns** - server-side, client-side, and human-in-the-loop approval examples.
- **Scheduling** - one-time, delayed, and recurring task examples.
- **Reasoning display** - shows model reasoning parts as they stream, then collapses when done.
- **Debug mode** - inspect raw message JSON from the header toggle.
- **Kumo UI** - Cloudflare's design system with light and dark mode.
- **Realtime state** - WebSocket connections, synchronized agent state, and persistent messages.

## Making It Your Own

### Name Your Project

Update the name in `package.json` and `wrangler.jsonc`. The `name` in `wrangler.jsonc` becomes your deployed Worker URL:

```txt
<name>.<subdomain>.workers.dev
```

### Change the Main Assistant

Edit the `system` string in `Chat.onChatMessage` in `src/server.ts`.

That prompt decides when the assistant should answer directly, call tools, use shared MCP tools, delegate to helper agents, or schedule work.

### Replace Demo Tools

The starter ships with intentionally fake tools. For example, `getWeather` returns random weather. Replace it with a real API call:

```ts
getWeather: tool({
  description: "Get the current weather for a city",
  inputSchema: z.object({
    city: z.string().describe("City name")
  }),
  execute: async ({ city }) => {
    const res = await fetch(`https://api.weather.example/${city}`);
    return res.json();
  }
});
```

### Add a Server-Side Tool

Add server-side tools to the `tools` object in `Chat.onChatMessage`:

```ts
lookupOrder: tool({
  description: "Look up an order by ID",
  inputSchema: z.object({
    orderId: z.string()
  }),
  execute: async ({ orderId }) => {
    return await getOrder(orderId);
  }
});
```

### Add a Client-Side Tool

Client-side tools omit `execute` on the server. The browser returns the result in `app.tsx` through `onToolCall`.

Server:

```ts
getUserTimezone: tool({
  description: "Get the user's timezone from their browser.",
  inputSchema: z.object({})
});
```

Client:

```ts
useAgentChat({
  agent,
  onToolCall: async (event) => {
    if (
      "addToolOutput" in event &&
      event.toolCall.toolName === "getUserTimezone"
    ) {
      event.addToolOutput({
        toolCallId: event.toolCall.toolCallId,
        output: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      });
    }
  }
});
```

### Add an Approval Tool

Use `needsApproval` when a tool should pause for user confirmation:

```ts
chargeCard: tool({
  description: "Charge a customer card",
  inputSchema: z.object({
    amount: z.number(),
    customerId: z.string()
  }),
  needsApproval: async ({ amount }) => amount > 100,
  execute: async ({ amount, customerId }) => {
    return await chargeCustomer(customerId, amount);
  }
});
```

The UI already renders approve/reject buttons for approval requests.

### Add a Helper Agent

Helper agents are useful when you want the main assistant to delegate focused work while keeping a transcript of what the helper did.

1. Create a helper class in `src/server.ts`:

```ts
class Critic extends HelperAgent {
  protected getSystemPrompt(): string {
    return "You are a focused review helper. Find risks and missing tests.";
  }
}
```

2. Expose it as an agent tool in `Chat.onChatMessage`:

```ts
review: agentTool(Critic, {
  description: "Dispatch a Critic helper agent to review a proposal.",
  displayName: "Critic",
  inputSchema: z.object({
    proposal: z.string().min(5)
  })
});
```

3. Allow drill-in routing from `Chat.onBeforeSubAgent`:

```ts
if (
  child.className !== "Researcher" &&
  child.className !== "Planner" &&
  child.className !== "Critic"
) {
  return new Response(`Unknown helper agent class: ${child.className}`, {
    status: 404
  });
}
```

4. Add the display name to `KNOWN_HELPER_TYPES` in `src/app.tsx`:

```ts
const KNOWN_HELPER_TYPES = new Set(["Researcher", "Planner", "Critic"]);
```

### Customize Shared MCP

The MCP panel in the header calls `Inbox.addServer` and `Inbox.removeServer`. MCP servers are connected to the root `Inbox`, then exposed to every `Chat` through `SharedMCPClient`.

This keeps external tool configuration shared across all chats instead of reconnecting every chat independently.

To make MCP more production-ready, you may want to:

- preconfigure trusted MCP servers instead of relying on user-entered URLs
- add allowlists or authentication requirements
- handle slow or failing MCP servers with a fallback to normal chat
- customize how MCP tool results are rendered in `ToolPartView`

See [MCP Client API](https://developers.cloudflare.com/agents/api-reference/mcp-client-api/).

### Customize Scheduled Tasks

When a scheduled task fires, `Chat.executeTask` runs on the server. The starter logs the task and broadcasts a toast notification to connected clients.

Replace it with real work:

```ts
async executeTask(description: string, task: Schedule<string>) {
  await sendEmail({
    to: "user@example.com",
    subject: "Scheduled reminder",
    text: description
  });

  this.broadcast(
    JSON.stringify({
      type: "scheduled-task",
      description,
      timestamp: new Date().toISOString()
    })
  );
}
```

`broadcast()` is used instead of injecting a message into chat history. That avoids making the model see the notification as new user context and accidentally re-trigger the same scheduled task.

### Remove Scheduling

If you do not need scheduling, remove:

- `scheduleTask`
- `getScheduledTasks`
- `cancelScheduledTask`
- `executeTask`
- `getSchedulePrompt`, `scheduleSchema`, and `Schedule` imports
- the scheduling sentence from the main system prompt

### Add App State

Use `this.setState()` and `this.state` for realtime state that syncs to connected clients.

This starter uses state in `Inbox` to sync the chat list:

```ts
export interface InboxState {
  chats: ChatSummary[];
}
```

See [Store and sync state](https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/).

### Manage Long Conversations

By default, the starter sends the full persisted chat history to the model. This makes the template easier to understand because previous tool calls, helper-agent outputs, and user messages stay in context.

For production apps with long conversations, consider adding context management in `Chat.onChatMessage`, such as:

- `pruneMessages` from the AI SDK
- periodic conversation summaries
- per-tool result summarization
- product-specific retention rules

### Add Callable Methods

Expose agent methods as typed RPC with `@callable()`:

```ts
import { callable } from "agents";

export class Inbox extends Agent<Env, InboxState> {
  @callable()
  async getChatCount() {
    return this.state.chats.length;
  }
}
```

Call it from React:

```ts
const count = await inbox.call("getChatCount");
```

See [Callable methods](https://developers.cloudflare.com/agents/api-reference/callable-methods/).

## Durable Objects and Routing

`wrangler.jsonc` binds the root `Inbox` Durable Object. `Chat`, `Researcher`, and `Planner` are reached as subagents through the Agents SDK routing layer.

The browser connects to paths like:

```txt
Inbox / demo-user / Chat / <chat-id>
Inbox / demo-user / Chat / <chat-id> / Researcher / <run-id>
```

`onBeforeSubAgent` in `Inbox` and `Chat` validates that callers can only open known child agents that already exist.

If you rename agent classes, update:

- class exports in `src/server.ts`
- `wrangler.jsonc` migrations when needed
- `env.d.ts` by running `npm run types`
- `agent` names passed to `useAgent` in `src/app.tsx`
- helper display names in `KNOWN_HELPER_TYPES`

## Use a Different AI Model Provider

The starter uses [Workers AI](https://developers.cloudflare.com/workers-ai/) by default:

```ts
const workersai = createWorkersAI({ binding: this.env.AI });

const result = streamText({
  model: workersai("@cf/moonshotai/kimi-k2.6", {
    sessionAffinity: this.sessionAffinity
  })
  // ...
});
```

To use a different provider, install the provider package and replace the model passed to `streamText`.

### OpenAI

```bash
npm install @ai-sdk/openai
```

```ts
import { openai } from "@ai-sdk/openai";

const result = streamText({
  model: openai("gpt-5.2")
  // ...
});
```

Create a `.env` file with your API key:

```txt
OPENAI_API_KEY=your-key-here
```

### Anthropic

```bash
npm install @ai-sdk/anthropic
```

```ts
import { anthropic } from "@ai-sdk/anthropic";

const result = streamText({
  model: anthropic("claude-sonnet-4-20250514")
  // ...
});
```

Create a `.env` file with your API key:

```txt
ANTHROPIC_API_KEY=your-key-here
```

## Deploy

```bash
npm run deploy
```

Your app runs on Cloudflare's global network. Messages and agent state persist in Durable Object storage, streams resume on disconnect, and agents can hibernate when idle.

## Development Commands

```bash
npm run dev      # start local development
npm run types    # regenerate env.d.ts from wrangler.jsonc
npm run check    # format check, lint, and TypeScript
npm run deploy   # build and deploy
```

## Learn More

- [Agents SDK documentation](https://developers.cloudflare.com/agents/)
- [Build a chat agent tutorial](https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent/)
- [Chat agents API reference](https://developers.cloudflare.com/agents/api-reference/chat-agents/)
- [MCP Client API](https://developers.cloudflare.com/agents/api-reference/mcp-client-api/)
- [Workers AI models](https://developers.cloudflare.com/workers-ai/models/)
- [AI SDK documentation](https://ai-sdk.dev/docs)

## License

MIT
