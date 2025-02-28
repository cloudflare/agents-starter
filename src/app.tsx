import { useEffect, useState, useRef } from "react";
import { useAgent } from "agents-sdk/react";
import { useAgentChat } from "agents-sdk/ai-react";
import { type Message } from "@ai-sdk/react";
import { APPROVAL } from "./shared";
import type { tools } from "./tools";

// List of tools that require human confirmation
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation",
];

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Set initial theme
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  // Scroll to bottom on mount
  useEffect(() => {
    scrollToBottom();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const agent = useAgent({
    agent: "chat",
  });

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    addToolResult,
    clearHistory,
  } = useAgentChat({
    agent,
    maxSteps: 5,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const pendingToolCallConfirmation = messages.some((m: Message) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "call" &&
        toolsRequiringConfirmation.includes(
          part.toolInvocation.toolName as keyof typeof tools
        )
    )
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>AI Chat Assistant</h1>
          <p className="subtitle">Powered by Cloudflare Agents</p>
        </div>
        <div className="controls-container">
          <button
            onClick={toggleTheme}
            className="theme-switch"
            data-theme={theme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <div className="theme-switch-handle" />
          </button>
          <button onClick={clearHistory} className="clear-history">
            🗑️ Clear History
          </button>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages-wrapper">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>👋 Welcome!</h2>
              <p>
                Start a conversation with your AI assistant. Try asking about:
              </p>
              <ul>
                <li>🌤️ Weather information for any city</li>
                <li>🕒 Local time in different locations</li>
              </ul>
            </div>
          )}
          {messages?.map((m: Message) => (
            <div key={m.id} className={`message ${m.role}-message`}>
              <div className="message-header">
                <span className="message-role">{m.role}</span>
                <span className="message-time">
                  {new Date(m.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {m.parts?.map((part, i) => {
                switch (part.type) {
                  case "text":
                    return (
                      <div
                        key={i}
                        className={`message-content ${
                          part.text.startsWith("scheduled message")
                            ? "scheduled-message"
                            : ""
                        }`}
                      >
                        {part.text.replace(/^scheduled message: /, "")}
                      </div>
                    );
                  case "tool-invocation":
                    const toolInvocation = part.toolInvocation;
                    const toolCallId = toolInvocation.toolCallId;

                    if (
                      toolsRequiringConfirmation.includes(
                        toolInvocation.toolName as keyof typeof tools
                      ) &&
                      toolInvocation.state === "call"
                    ) {
                      return (
                        <div key={toolCallId} className="tool-invocation">
                          <div className="tool-header">
                            <span className="tool-icon">🛠️</span>
                            <span className="tool-name">
                              {toolInvocation.toolName}
                            </span>
                          </div>
                          <div className="tool-args">
                            Arguments:{" "}
                            <code>
                              {JSON.stringify(toolInvocation.args, null, 2)}
                            </code>
                          </div>
                          <div className="button-container">
                            <button
                              className="button-approve"
                              onClick={() =>
                                addToolResult({
                                  toolCallId,
                                  result: APPROVAL.YES,
                                })
                              }
                            >
                              ✓ Approve
                            </button>
                            <button
                              className="button-reject"
                              onClick={() =>
                                addToolResult({
                                  toolCallId,
                                  result: APPROVAL.NO,
                                })
                              }
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      );
                    }
                }
              })}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input
            disabled={pendingToolCallConfirmation}
            className="chat-input"
            value={input}
            placeholder={
              pendingToolCallConfirmation
                ? "Please respond to the tool confirmation above..."
                : "Type your message here..."
            }
            onChange={handleInputChange}
          />
          <button
            type="submit"
            className="send-button"
            disabled={pendingToolCallConfirmation || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
