// ── Tool definitions ─────────────────────────────────────────────────
//
// Tools let the model take actions: call APIs, run calculations, or
// interact with the browser. There are three kinds demonstrated here:
//
//   Server-side:  has an execute function — runs automatically on the server
//   Client-side:  no execute function — the browser handles it via onToolCall
//   Approval:     has needsApproval — asks the user before executing

import { tool, type ToolSet } from "ai";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";
import { z } from "zod";
import type { ChatAgent } from "./server";

const tools: ToolSet = {
  // Server-side tool: runs automatically on the server
  getWeather: tool({
    description: "Get the current weather for a city",
    inputSchema: z.object({
      city: z.string().describe("City name")
    }),
    execute: async ({ city }) => {
      // Replace with a real weather API in production
      const conditions = ["sunny", "cloudy", "rainy", "snowy"];
      const temp = Math.floor(Math.random() * 30) + 5;
      return {
        city,
        temperature: temp,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        unit: "celsius"
      };
    }
  }),

  // Client-side tool: no execute function — the browser handles it
  getUserTimezone: tool({
    description:
      "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
    inputSchema: z.object({})
  }),

  // Approval tool: requires user confirmation before executing
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
    needsApproval: async ({ a, b }) => Math.abs(a) > 1000 || Math.abs(b) > 1000,
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
      const { agent } = getCurrentAgent<ChatAgent>();
      if (!agent) return "Agent context not available";
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
        agent.schedule(input, "executeTask", description);
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
      const { agent } = getCurrentAgent<ChatAgent>();
      if (!agent) return "Agent context not available";
      const tasks = agent.getSchedules();
      return tasks.length > 0 ? tasks : "No scheduled tasks found.";
    }
  }),

  cancelScheduledTask: tool({
    description: "Cancel a scheduled task by its ID",
    inputSchema: z.object({
      taskId: z.string().describe("The ID of the task to cancel")
    }),
    execute: async ({ taskId }) => {
      const { agent } = getCurrentAgent<ChatAgent>();
      if (!agent) return "Agent context not available";
      try {
        agent.cancelSchedule(taskId);
        return `Task ${taskId} cancelled.`;
      } catch (error) {
        return `Error cancelling task: ${error}`;
      }
    }
  })
};

export default tools;
