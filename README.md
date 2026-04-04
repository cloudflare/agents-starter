# cf_ai_cloudfare

Welcome to the Cloudflare AI Agent application! This project was built to fulfill the Cloudflare AI App assignment criteria, creating a fully-featured, stateful AI chat agent running entirely on the Cloudflare developer platform.

## Architecture

This application includes:
- **LLM**: Powered natively by Cloudflare Workers AI using the `@cf/meta/llama-3.3-70b-instruct-fp8-fast` model.
- **Workflow / Coordination**: Built on top of the `@cloudflare/agents` SDK utilizing **Durable Objects**. The agent runs statefully, maintaining its own SQLite database and managing its own lifecycle natively.
- **User Input & UI**: Uses a responsive web UI with the `useAgentChat` hook connecting via persistent WebSockets. 
- **Memory & State**: The Durable Object intrinsically persists all conversation history and scheduling state across requests, surviving deployments and hibernation seamlessly.

### Additional Agent Capabilities (Built-in to the SDK)
- **Tool Use**: Includes examples of Server-Side, Client-Side, and Human-in-the-Loop approval tools (e.g. calculator, weather, timezone detection).
- **Task Scheduling**: The agent can schedule tasks via chron or delays natively from the prompt.
- **MCP Extensibility**: Capable of integrating with Model Context Protocol servers.

## Running Instructions

To run this application locally and try out the components:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Development Server**
   ```bash
   npm run dev
   ```

3. **Open the Application**
   Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

### Trying out the Components

You can test the agent's capabilities with the following prompts:
- *Scheduling*: "Remind me in 10 seconds that I have a meeting."
- *Server-Side Tool*: "What is the weather in London?"
- *Approval Tool*: "Calculate 500 * 2000."
- *Memory*: Send a message, close the window, and reopen the page. You will see that the history is maintained seamlessly by the Durable Object.

## AI Usage

The scaffold, setup, and modifications to this assignment were completed using the Antigravity AI Agent. 
Please refer to the [PROMPTS.md](PROMPTS.md) file to see the exact input prompts used to generate the current state of this repository.

## Deploy

To deploy this agent directly to your own Cloudflare infrastructure:
```bash
npm run deploy
```
