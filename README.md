# Agent Starter

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A starter template for building AI chat agents on Cloudflare, powered by the [Agents SDK](https://developers.cloudflare.com/agents/).

Uses Workers AI (no API key required), with tools for weather, timezone detection, calculations with approval, task scheduling, and vision (image input).

## Quick start

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
cd agents-starter
npm install
npm run dev
```

> **Cloudflare authentication is required to run locally.** This template uses
> Workers AI with `"ai": { "remote": true }` in `wrangler.jsonc`, and Workers AI
> has no local simulator — so `npm run dev` opens a remote proxy session against
> Cloudflare and needs you to be authenticated. Either run `wrangler login` once
> in an interactive terminal, or set a `CLOUDFLARE_API_TOKEN` environment
> variable (e.g. in a `.env` file). No third-party (OpenAI/Anthropic) key is
> needed, but a Cloudflare login is.

Open [http://localhost:5173](http://localhost:5173) to see your agent in action.

Try these prompts to see the different features:

- **"What's the weather in Paris?"** — server-side tool (runs automatically)
- **"What timezone am I in?"** — client-side tool (browser provides the answer)
- **"Calculate 5000 \* 3"** — approval tool (asks you before running)
- **"Remind me in 5 minutes to take a break"** — scheduling
- **Drop an image and ask "What's in this image?"** — vision (image understanding)

## Project structure

```
src/
  server.ts    # Chat agent with tools and scheduling
  app.tsx      # Chat UI built with Kumo components
  client.tsx   # React entry point
  styles.css   # Tailwind + Kumo styles
```

## What's included

- **AI Chat** — Streaming responses powered by Workers AI via `AIChatAgent`
- **Image input** — Drag-and-drop, paste, or click to attach images for vision-capable models
- **Three tool patterns** — server-side auto-execute, client-side (browser), and human-in-the-loop approval
- **Scheduling** — one-time, delayed, and recurring (cron) tasks
- **Reasoning display** — shows model thinking as it streams, collapses when done
- **Debug mode** — toggle in the header to inspect raw message JSON for each message
- **Kumo UI** — Cloudflare's design system with dark/light mode
- **Real-time** — WebSocket connection with automatic reconnection and message persistence

## Making it your own

### Name your project

Update the name in `package.json` and `wrangler.jsonc` — the `name` in `wrangler.jsonc` becomes your deployed Worker's URL (`<name>.<subdomain>.workers.dev`).

### Change the system prompt

Edit the `system` string in `server.ts` to give your agent a different personality or focus area. This is the most impactful single change you can make.

### Replace the demo tools with real ones

The starter ships with demo tools (`getWeather` returns random data, `calculate` does basic arithmetic). Replace them with real implementations:

```ts
// In server.ts, replace a demo tool with a real API call:
getWeather: tool({
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`https://api.weather.example/${city}`);
    return res.json();
  }
}),
```

### Add your own tools

Add new tools to the `tools` object in `server.ts`. There are three patterns:

```ts
// Auto-execute: runs on the server, no user interaction
myTool: tool({
  description: "...",
  inputSchema: z.object({ /* ... */ }),
  execute: async (input) => { /* return result */ }
}),

// Client-side: no execute function, browser provides the result
// Handle it in app.tsx via the onToolCall callback
browserTool: tool({
  description: "...",
  inputSchema: z.object({ /* ... */ })
}),

// Approval: add needsApproval to gate execution
sensitiveTool: tool({
  description: "...",
  inputSchema: z.object({ /* ... */ }),
  needsApproval: async (input) => true, // or conditional logic
  execute: async (input) => { /* runs after approval */ }
}),
```

### Customize scheduled task behavior

When a scheduled task fires, `executeTask` runs on the server. It does its work and then uses `this.broadcast()` to notify connected clients (shown as a toast notification in the UI). Replace it with your own logic:

```ts
async executeTask(description: string, task: Schedule<string>) {
  // Do the actual work
  await sendEmail({ to: "user@example.com", subject: description });

  // Notify connected clients
  this.broadcast(
    JSON.stringify({ type: "scheduled-task", description, timestamp: new Date().toISOString() })
  );
}
```

> **Why `broadcast()` instead of `saveMessages()`?** Injecting into chat history can cause the AI to see the notification as new context and re-trigger the same task in a loop. `broadcast()` sends a one-off event that the client displays separately from the conversation.

### Remove scheduling

If you don't need scheduling, remove `scheduleTask`, `getScheduledTasks`, and `cancelScheduledTask` from the tools object, the `executeTask` method, and the schedule-related imports (`getSchedulePrompt`, `scheduleSchema`, `Schedule`).

### Add state beyond chat messages

Use `this.setState()` and `this.state` for real-time state that syncs to all connected clients. See [Store and sync state](https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/).

### Add callable methods

Expose agent methods as typed RPC that your client can call directly:

```ts
import { callable } from "agents";

export class ChatAgent extends AIChatAgent<Env> {
  @callable()
  async getStats() {
    return { messageCount: this.messages.length };
  }
}

// Client-side:
const stats = await agent.call("getStats");
```

See [Callable methods](https://developers.cloudflare.com/agents/api-reference/callable-methods/).

### Connect to MCP servers

Add external tools from MCP servers:

```ts
async onChatMessage(onFinish, options) {
  // Connect to an MCP server
  await this.mcp.connect("https://my-mcp-server.example/sse");

  const result = streamText({
    // ...
    tools: {
      ...myTools,
      ...this.mcp.getAITools() // Include MCP tools
    }
  });
}
```

See [MCP Client API](https://developers.cloudflare.com/agents/api-reference/mcp-client-api/).

## Use a different AI model provider

The starter uses [Workers AI](https://developers.cloudflare.com/workers-ai/) by default (no API key needed). To use a different provider:

### OpenAI

```bash
npm install @ai-sdk/openai
```

```ts
// In server.ts, replace the model:
import { openai } from "@ai-sdk/openai";

// Inside onChatMessage:
const result = streamText({
  model: openai("gpt-5.2")
  // ...
});
```

Create a `.env` file with your API key:

```
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

```
ANTHROPIC_API_KEY=your-key-here
```

## Deploy

```bash
npm run deploy
```

Your agent is live on Cloudflare's global network. Messages persist in SQLite, streams resume on disconnect, and the agent hibernates when idle.

## Learn more

- [Agents SDK documentation](https://developers.cloudflare.com/agents/)
- [Build a chat agent tutorial](https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent/)
- [Chat agents API reference](https://developers.cloudflare.com/agents/api-reference/chat-agents/)
- [Workers AI models](https://developers.cloudflare.com/workers-ai/models/)

## License

MIT
