import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import {
  Button,
  Badge,
  InputArea,
  Empty,
  Surface,
  Text,
  Collapsible,
  Loader,
  CodeBlock
} from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { Switch } from "@cloudflare/kumo";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  GearIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  BrainIcon,
  CaretDownIcon,
  BugIcon,
  PaperclipIcon,
  XIcon,
  FileIcon,
  ImageIcon,
  MicrophoneIcon
} from "@phosphor-icons/react";

// ── Attachment helpers ────────────────────────────────────────────────

interface Attachment {
  id: string;
  file: File;
  preview: string;
  mediaType: string;
}

const isImageType = (t: string) => t.startsWith("image/");
const isAudioType = (t: string) => t.startsWith("audio/") || t === "video/webm";

// Derives the agent's HTTP base path from the useAgent result.
// All file operations (upload, serve, metadata, delete) go through
// the agent's onRequest handler at this path.
function getAgentBasePath(agent: { agent: string; name: string }): string {
  const kebab = agent.agent.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return `/agents/${kebab}/${agent.name}`;
}

async function uploadFile(
  file: File,
  basePath: string
): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${basePath}/upload`, {
    method: "POST",
    body: form
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

function createAttachment(file: File): Attachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: isImageType(file.type) ? URL.createObjectURL(file) : "",
    mediaType: file.type || "application/octet-stream"
  };
}

// ── Small components ──────────────────────────────────────────────────

const captionCache = new Map<string, string>();

function FileCaption({ url, basePath }: { url: string; basePath: string }) {
  const r2Key = url.startsWith("files/") ? url.slice("files/".length) : "";
  const [caption, setCaption] = useState<string | null>(
    captionCache.get(r2Key) ?? null
  );
  const [open, setOpen] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open || !r2Key || fetchedRef.current) return;
    fetchedRef.current = true;
    if (captionCache.has(r2Key)) {
      setCaption(captionCache.get(r2Key)!);
      return;
    }
    let cancelled = false;
    fetch(`${basePath}/files-meta/${r2Key}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((meta) => {
        const m = meta as { description?: string; transcript?: string } | null;
        if (cancelled || !m) return;
        const text = m.description || m.transcript;
        if (text) {
          captionCache.set(r2Key, text);
          setCaption(text);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, r2Key, basePath]);

  if (!r2Key) return null;
  return (
    <Collapsible
      label={caption ? "AI description" : "Show AI description..."}
      open={open}
      onOpenChange={setOpen}
      className="mt-1.5"
    >
      {caption ? (
        <Text size="xs" variant="secondary">
          {caption}
        </Text>
      ) : (
        <Loader size="sm" />
      )}
    </Collapsible>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

// ── Tool rendering ────────────────────────────────────────────────────

function ToolPartView({
  part,
  addToolApprovalResponse
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  if (part.state === "output-available") {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2 mb-1">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <div className="font-mono">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.output, null, 2)}
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-warning">
          <div className="flex items-center gap-2 mb-2">
            <GearIcon size={14} className="text-kumo-warning" />
            <Text size="sm" bold>
              Approval needed: {toolName}
            </Text>
          </div>
          <div className="font-mono mb-3">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.input, null, 2)}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId)
                  addToolApprovalResponse({ id: approvalId, approved: true });
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId)
                  addToolApprovalResponse({ id: approvalId, approved: false });
              }}
            >
              Reject
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  if (
    part.state === "output-denied" ||
    ("approval" in part &&
      (part.approval as { approved?: boolean })?.approved === false)
  ) {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <XCircleIcon size={14} className="text-kumo-danger" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Rejected</Badge>
          </div>
        </Surface>
      </div>
    );
  }

  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <GearIcon size={14} className="text-kumo-inactive animate-spin" />
            <Text size="xs" variant="secondary">
              Running {toolName}...
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

// ── Main chat ─────────────────────────────────────────────────────────

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useKumoToastManager();

  const agent = useAgent({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toasts.add({
              title: "Scheduled task completed",
              description: data.description,
              timeout: 0
            });
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts]
    )
  });

  const basePath = getAgentBasePath(agent);

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) textareaRef.current.focus();
  }, [isStreaming]);

  // ── Clear history (also deletes uploaded files from R2) ─────────

  const handleClear = useCallback(async () => {
    const fileUrls = messages.flatMap((m) =>
      m.parts
        .filter((p) => p.type === "file")
        .map((p) => (p as { url?: string }).url)
        .filter((url): url is string => typeof url === "string")
    );
    const keys = fileUrls
      .filter((url) => url.startsWith("files/"))
      .map((url) => url.slice("files/".length));
    if (keys.length > 0) {
      fetch(`${basePath}/delete-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys })
      }).catch(() => {});
    }
    captionCache.clear();
    clearHistory();
  }, [messages, clearHistory, basePath]);

  // ── Attachment handlers ──────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    setAttachments((prev) => [
      ...prev,
      ...Array.from(files).map(createAttachment)
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInput("");

    // Upload files to R2 first — messages store lightweight URLs
    // instead of multi-MB base64 data URIs.
    let fileParts: Array<{
      type: "file";
      mediaType: string;
      url: string;
      filename: string;
    }> = [];
    if (attachments.length > 0) {
      setIsUploading(true);
      try {
        fileParts = await Promise.all(
          attachments.map(async (att) => {
            const { url } = await uploadFile(att.file, basePath);
            return {
              type: "file" as const,
              mediaType: att.mediaType,
              url,
              filename: att.file.name
            };
          })
        );
      } catch (err) {
        setIsUploading(false);
        toasts.add({
          title: "Upload failed",
          description:
            err instanceof Error ? err.message : "Could not upload files",
          timeout: 5000
        });
        return;
      }
      setIsUploading(false);
    }
    for (const att of attachments) {
      if (att.preview) URL.revokeObjectURL(att.preview);
    }
    setAttachments([]);

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string; filename: string }
    > = [];
    if (text) parts.push({ type: "text", text });
    parts.push(...fileParts);

    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, isStreaming, sendMessage, toasts, basePath]);

  // ── Drag-and-drop ────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  // ── Voice recording ──────────────────────────────────────────────

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toasts.add({
        title: "Microphone access denied",
        description:
          "Allow microphone access in your browser settings to record voice messages.",
        timeout: 5000
      });
      return;
    }

    const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
      MediaRecorder.isTypeSupported(t)
    );
    const ext =
      mimeType === "audio/mp4"
        ? "m4a"
        : mimeType === "audio/ogg"
          ? "ogg"
          : "webm";
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      const file = new File([blob], `recording-${Date.now()}.${ext}`, {
        type
      });
      setAttachments((prev) => [...prev, createAttachment(file)]);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, [isRecording, toasts]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-screen bg-kumo-elevated relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-kumo-brand">
            <ImageIcon size={40} />
            <Text variant="heading3">Drop files here</Text>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Text variant="heading3" as="h1">
              <span className="mr-2">⛅</span>Agent Starter
            </Text>
            <Badge variant="secondary">
              <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
              AI Chat
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-kumo-success" : "text-kumo-danger"}
              />
              <Text size="xs" variant="secondary">
                {connected ? "Connected" : "Disconnected"}
              </Text>
            </div>
            <div className="flex items-center gap-1.5">
              <BugIcon size={14} className="text-kumo-inactive" />
              <Switch
                checked={showDebug}
                onCheckedChange={setShowDebug}
                size="sm"
                aria-label="Toggle debug mode"
              />
            </div>
            <ThemeToggle />
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={handleClear}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <Empty
              icon={<ChatCircleDotsIcon size={32} />}
              title="Start a conversation"
              contents={
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What's the weather in Paris?",
                    "What timezone am I in?",
                    "Calculate 5000 * 3",
                    "Remind me in 5 minutes to take a break"
                  ].map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      size="sm"
                      disabled={isStreaming}
                      onClick={() =>
                        sendMessage({
                          role: "user",
                          parts: [{ type: "text", text: prompt }]
                        })
                      }
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              }
            />
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {showDebug && (
                  <div className="overflow-auto max-h-64">
                    <CodeBlock
                      lang="jsonc"
                      code={JSON.stringify(message, null, 2)}
                    />
                  </div>
                )}

                {/* Tool parts */}
                {message.parts.filter(isToolUIPart).map((part) => (
                  <ToolPartView
                    key={part.toolCallId}
                    part={part}
                    addToolApprovalResponse={addToolApprovalResponse}
                  />
                ))}

                {/* Reasoning parts */}
                {message.parts
                  .filter(
                    (part) =>
                      part.type === "reasoning" &&
                      (part as { text?: string }).text?.trim()
                  )
                  .map((part, i) => {
                    const reasoning = part as {
                      type: "reasoning";
                      text: string;
                      state?: "streaming" | "done";
                    };
                    const isDone = reasoning.state === "done" || !isStreaming;
                    return (
                      <div key={i} className="flex justify-start">
                        <details className="max-w-[85%] w-full" open={!isDone}>
                          <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
                            <BrainIcon size={14} className="text-purple-400" />
                            <Text size="sm" bold>
                              Reasoning
                            </Text>
                            {isDone ? (
                              <Text size="xs" variant="success">
                                Complete
                              </Text>
                            ) : (
                              <Text size="xs">Thinking...</Text>
                            )}
                            <CaretDownIcon
                              size={14}
                              className="ml-auto text-kumo-inactive"
                            />
                          </summary>
                          <div className="mt-2 px-3 py-2 rounded-lg bg-kumo-control overflow-auto max-h-64">
                            <Text
                              variant="mono-secondary"
                              as="pre"
                              DANGEROUS_className="whitespace-pre-wrap text-xs"
                            >
                              {reasoning.text}
                            </Text>
                          </div>
                        </details>
                      </div>
                    );
                  })}

                {/* File parts (images / attachments) */}
                {message.parts
                  .filter((part) => part.type === "file")
                  .map((part, i) => {
                    const rawFp = part as {
                      type: "file";
                      mediaType: string;
                      url: string;
                      filename?: string;
                    };
                    const fileUrl = rawFp.url.startsWith("/")
                      ? rawFp.url
                      : `${basePath}/${rawFp.url}`;
                    const fp = { ...rawFp, url: fileUrl };
                    // Show a processing spinner on media in the last user
                    // message while the assistant is streaming — this is when
                    // the vision model or Whisper is running server-side.
                    // We find the last user message index rather than assuming
                    // it's always messages.length - 2, since tool call chains
                    // can insert additional messages between user and assistant.
                    let lastUserIndex = -1;
                    for (let j = messages.length - 1; j >= 0; j--) {
                      if (messages[j].role === "user") {
                        lastUserIndex = j;
                        break;
                      }
                    }
                    const isProcessing =
                      isUser &&
                      isStreaming &&
                      (isImageType(fp.mediaType) ||
                        isAudioType(fp.mediaType)) &&
                      index === lastUserIndex;
                    return (
                      <div
                        key={`file-${i}`}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`relative max-w-[85%] flex flex-col ${isUser ? "items-end" : "items-start"}`}
                        >
                          {isImageType(fp.mediaType) ? (
                            <>
                              <img
                                src={fp.url}
                                alt={fp.filename || "Attached image"}
                                className="max-h-64 rounded-xl border border-kumo-line object-contain"
                              />
                              {isProcessing && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-kumo-contrast/40">
                                  <Loader size="lg" className="text-white" />
                                </div>
                              )}
                            </>
                          ) : isAudioType(fp.mediaType) ? (
                            <div className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl border border-kumo-line bg-kumo-control">
                              <MicrophoneIcon
                                size={16}
                                className="text-kumo-brand"
                              />

                              {/* oxlint-disable-next-line jsx_a11y/media-has-caption */}
                              <audio
                                src={fp.url}
                                controls
                                preload="metadata"
                                className="h-8 max-w-[240px]"
                              />
                              {isProcessing && (
                                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-kumo-contrast/40">
                                  <Loader size="sm" className="text-white" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-kumo-line bg-kumo-control">
                              <FileIcon
                                size={16}
                                className="text-kumo-inactive"
                              />
                              <Text size="sm" variant="secondary">
                                {fp.filename || "Attached file"}
                              </Text>
                            </div>
                          )}
                          {!isProcessing && (
                            <FileCaption url={rawFp.url} basePath={basePath} />
                          )}
                        </div>
                      </div>
                    );
                  })}

                {/* Text parts */}
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => {
                    const text = (part as { type: "text"; text: string }).text;
                    if (!text) return null;

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                            <Streamdown
                              className="sd-theme sd-invert rounded-2xl rounded-br-md p-3"
                              controls={false}
                              isAnimating={false}
                            >
                              {text}
                            </Streamdown>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {text}
                          </Streamdown>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 py-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.html"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group rounded-lg border border-kumo-line bg-kumo-control overflow-hidden"
                >
                  {isImageType(att.mediaType) ? (
                    <img
                      src={att.preview}
                      alt={att.file.name}
                      className="h-16 w-16 object-cover"
                    />
                  ) : isAudioType(att.mediaType) ? (
                    <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1">
                      <MicrophoneIcon size={20} className="text-kumo-brand" />
                      <Text size="xs" variant="secondary">
                        Voice
                      </Text>
                    </div>
                  ) : (
                    <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1">
                      <FileIcon size={20} className="text-kumo-inactive" />
                      <Text
                        size="xs"
                        variant="secondary"
                        DANGEROUS_className="truncate w-full text-center"
                      >
                        {att.file.name}
                      </Text>
                    </div>
                  )}
                  {isUploading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-kumo-contrast/50">
                      <Loader size="sm" className="text-kumo-inverse" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove ${att.file.name}`}
                    >
                      <XIcon size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
            <Button
              type="button"
              variant="ghost"
              shape="square"
              aria-label="Attach files"
              icon={<PaperclipIcon size={18} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!connected || isStreaming || isRecording}
              className="mb-0.5"
            />
            <Button
              type="button"
              variant={isRecording ? "destructive" : "ghost"}
              shape="square"
              aria-label={isRecording ? "Stop recording" : "Record voice"}
              icon={
                isRecording ? (
                  <StopIcon size={18} />
                ) : (
                  <MicrophoneIcon size={18} />
                )
              }
              onClick={toggleRecording}
              disabled={!connected || isStreaming}
              className={`mb-0.5 ${isRecording ? "animate-pulse" : ""}`}
            />
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const files: File[] = [];
                for (const item of items) {
                  if (item.kind === "file") {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                  }
                }
                if (files.length > 0) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              placeholder={
                attachments.length > 0
                  ? "Add a message or send attachments..."
                  : "Send a message..."
              }
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                shape="square"
                aria-label="Stop generation"
                icon={<StopIcon size={18} />}
                onClick={stop}
                className="mb-0.5"
              />
            ) : (
              <Button
                type="submit"
                variant="primary"
                shape="square"
                aria-label="Send message"
                disabled={
                  (!input.trim() && attachments.length === 0) || !connected
                }
                icon={<PaperPlaneRightIcon size={18} />}
                className="mb-0.5"
              />
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen">
            <Loader size="lg" />
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
