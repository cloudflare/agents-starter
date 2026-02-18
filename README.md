# Agent Starter

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A starter template for building multimodal AI chat agents on Cloudflare, powered by the [Agents SDK](https://developers.cloudflare.com/agents/).

Uses Workers AI (no API key required), with image analysis, voice transcription, tools, and task scheduling — all running on Cloudflare's global network.

## Quick start

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
cd agents-starter
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see your agent in action.

Try these prompts and interactions:

- **"What's the weather in Paris?"** — server-side tool (runs automatically)
- **"What timezone am I in?"** — client-side tool (browser provides the answer)
- **"Calculate 5000 \* 3"** — approval tool (asks you before running)
- **"Remind me in 5 minutes to take a break"** — scheduling
- **Drop an image** into the chat and ask "What is this?" — image analysis via vision model
- **Click the mic button** and ask a question — voice input via Whisper transcription

## Project structure

```
src/
  server.ts    # Chat agent, model setup, and file routes (onRequest)
  tools.ts     # Tool definitions (server-side, client-side, approval)
  vision.ts    # Image → text description via vision model + R2 cache
  audio.ts     # Audio → text transcript via Whisper + R2 cache
  app.tsx      # Chat UI with multimodal input (Kumo components)
  client.tsx   # React entry point
  styles.css   # Tailwind + Kumo styles
```

## What's included

- **AI Chat** — Streaming responses powered by Workers AI via `AIChatAgent`
- **Multimodal input** — Attach images (file picker, drag-and-drop, clipboard paste) and record voice messages
- **Image analysis** — A separate vision model describes uploaded images; descriptions are cached in R2 metadata
- **Voice transcription** — Whisper transcribes audio recordings; transcripts are cached in R2 metadata
- **Three tool patterns** — server-side auto-execute, client-side (browser), and human-in-the-loop approval
- **Scheduling** — one-time, delayed, and recurring (cron) tasks
- **R2 file storage** — Uploaded files are stored in R2, not embedded as base64 in messages
- **Markdown rendering** — Both user and assistant messages render markdown via Streamdown
- **Reasoning display** — shows model thinking as it streams, collapses when done
- **Debug mode** — toggle in the header to inspect raw message JSON
- **Kumo UI** — Cloudflare's design system with dark/light mode
- **Real-time** — WebSocket connection with automatic reconnection and message persistence

## How the multimodal pipeline works

When a user sends an image or voice recording:

1. **Client** uploads the file to R2 via the agent's `onRequest` handler
2. **Message** is sent with a lightweight `/files/` URL (not a multi-MB base64 string)
3. **Server** pre-processes the message before the chat model sees it:
   - **Images** → Llama 3.2 Vision describes the image, result cached in R2 metadata
   - **Audio** → Whisper transcribes the recording, result cached in R2 metadata
4. **Chat model** receives text descriptions like `[Attached image: ...]` and `[Voice message: ...]`
5. **Client** displays the media inline with a collapsible AI description underneath

On subsequent turns, cached descriptions are reused — no redundant model calls.

## Making it your own

### Change the system prompt

Edit the `system` string in `server.ts` to give your agent a different personality or focus area. This is the most impactful single change you can make.

### Replace the demo tools with real ones

The starter ships with demo tools (`getWeather` returns random data, `calculate` does basic arithmetic). Replace them with real implementations in `tools.ts`:

```ts
// In tools.ts:
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

Add new tools to the `tools` object in `tools.ts`. There are three patterns:

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

Tools use `getCurrentAgent()` from the Agents SDK to access the agent instance — no need to pass it as an argument. See [getCurrentAgent()](https://developers.cloudflare.com/agents/api-reference/get-current-agent/).

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

If you don't need scheduling, remove `scheduleTask`, `getScheduledTasks`, and `cancelScheduledTask` from `tools.ts`, the `executeTask` method in `server.ts`, and the schedule-related imports.

### Adjust the upload size limit

The default max upload size is 10 MB. Change `MAX_UPLOAD_BYTES` at the top of `server.ts`:

```ts
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
```

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
  await this.mcp.connect("https://my-mcp-server.example/sse");

  const result = streamText({
    // ...
    tools: {
      ...myTools,
      ...this.mcp.getAITools()
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

const chatModel = openai("gpt-4o");
// Delete visionModel and the describeImageParts call —
// GPT-4o handles images natively, no pre-processing needed.
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

const chatModel = anthropic("claude-sonnet-4-20250514");
// Delete visionModel and the describeImageParts call —
// Claude handles images natively.
```

Create a `.env` file with your API key:

```
ANTHROPIC_API_KEY=your-key-here
```

> **Note:** When switching to a model that supports images natively, you can delete `vision.ts` entirely and remove the `describeImageParts` call in `server.ts`. The image file parts will be passed directly to the model. Audio transcription via `audio.ts` still applies regardless of provider.

## Deploy

Before deploying, create the R2 bucket:

```bash
npx wrangler r2 bucket create agent-starter-uploads
```

Then deploy:

```bash
npm run deploy
```

Your agent is live on Cloudflare's global network. Messages persist in SQLite, uploaded files are stored in R2, streams resume on disconnect, and the agent hibernates when idle.

## Learn more

- [Agents SDK documentation](https://developers.cloudflare.com/agents/)
- [Build a chat agent tutorial](https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent/)
- [Chat agents API reference](https://developers.cloudflare.com/agents/api-reference/chat-agents/)
- [Workers AI models](https://developers.cloudflare.com/workers-ai/models/)

## License

MIT
