import { useEffect, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { AgentToolRunState } from "agents/chat";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  ArrowSquareOutIcon,
  BrainIcon,
  CaretDownIcon,
  CheckCircleIcon,
  GearIcon,
  RobotIcon,
  XCircleIcon,
  XIcon
} from "@phosphor-icons/react";
import { DEMO_USER, KNOWN_HELPER_TYPES } from "../constants";

export type HelperState = {
  helperId: string;
  helperType: string;
  query: string;
  status: "running" | "done" | "error";
  parts: UIMessage["parts"];
  summary?: string;
  error?: string;
};

export function toHelperState(run: AgentToolRunState): HelperState {
  const preview =
    typeof run.inputPreview === "string"
      ? run.inputPreview
      : run.inputPreview === undefined
        ? ""
        : JSON.stringify(run.inputPreview);
  return {
    helperId: run.runId,
    helperType: run.display?.name ?? run.agentType,
    query: preview,
    status:
      run.status === "completed"
        ? "done"
        : run.status === "running"
          ? "running"
          : "error",
    parts: run.parts,
    summary: run.summary,
    error: run.error
  };
}

function helperAgentName(helperType: string): string {
  return helperType.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function helperPreviewText(state: HelperState): string {
  if (state.error) return state.error;
  if (state.status === "done" && state.summary) return state.summary;

  for (const part of [...state.parts].reverse()) {
    if (part.type === "text" && part.text.trim()) {
      return part.text.trim();
    }
    if (part.type === "reasoning") {
      const text = (part as { text?: string }).text?.trim();
      if (text) return text;
    }
    if (isToolUIPart(part)) {
      return `${getToolName(part)}: ${part.state}`;
    }
  }

  return state.status === "running"
    ? `${state.helperType} is starting...`
    : state.query || "No subagent output yet";
}

function HelperRunView({
  state,
  onDrillIn
}: {
  state: HelperState;
  onDrillIn: (state: HelperState) => void;
}) {
  const [open, setOpen] = useState(false);
  const preview = helperPreviewText(state);
  const isRunning = state.status === "running";

  return (
    <Surface className="mt-2 p-2.5 rounded-lg ring ring-kumo-line bg-kumo-base/70">
      <div className="w-full flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <CaretDownIcon
            size={12}
            className={open ? "" : "-rotate-90 transition-transform"}
          />
          <span className="relative flex size-3 shrink-0 items-center justify-center">
            {isRunning && (
              <span className="absolute inline-flex size-3 rounded-full bg-kumo-accent opacity-30 animate-ping" />
            )}
            <BrainIcon
              size={14}
              className={isRunning ? "text-kumo-accent" : "text-kumo-inactive"}
            />
          </span>
          <span className="shrink-0">
            <Text size="xs" bold>
              {state.helperType}
            </Text>
          </span>
          <span className="min-w-0 flex-1 truncate rounded-md bg-kumo-elevated px-2 py-1">
            <span
              className={`block truncate text-xs ${
                isRunning ? "text-kumo-default" : "text-kumo-subtle"
              }`}
              title={preview}
            >
              {preview}
            </span>
          </span>
          {state.query && !open && (
            <span className="hidden max-w-48 truncate lg:block">
              <Text size="xs" variant="secondary">
                {state.query}
              </Text>
            </span>
          )}
        </button>
        <Badge variant={state.status === "error" ? "destructive" : "secondary"}>
          {state.status === "running"
            ? "Running"
            : state.status === "done"
              ? "Done"
              : "Error"}
        </Badge>
        <Button
          variant="ghost"
          shape="square"
          size="sm"
          aria-label={`Drill in to ${state.helperType}`}
          icon={<ArrowSquareOutIcon size={14} />}
          onClick={() => onDrillIn(state)}
        />
      </div>
      {open && (
        <div className="mt-2 pl-4 border-l border-kumo-line space-y-2">
          {state.query && (
            <div className="text-xs text-kumo-subtle">Input: {state.query}</div>
          )}
          {state.parts.map((part, index) => {
            if (part.type === "text") {
              return (
                <Streamdown
                  key={index}
                  className="sd-theme text-xs"
                  plugins={{ code }}
                  controls={false}
                >
                  {part.text}
                </Streamdown>
              );
            }
            if (part.type === "reasoning") {
              return (
                <div key={index} className="text-xs text-kumo-subtle">
                  {(part as { text?: string }).text}
                </div>
              );
            }
            if (isToolUIPart(part)) {
              return (
                <div
                  key={part.toolCallId ?? index}
                  className="text-xs text-kumo-subtle font-mono"
                >
                  {getToolName(part)}: {part.state}
                </div>
              );
            }
            return null;
          })}
          {state.summary && (
            <Streamdown
              className="sd-theme rounded-md bg-kumo-elevated p-2 text-xs"
              plugins={{ code }}
              controls={false}
            >
              {state.summary}
            </Streamdown>
          )}
          {state.error && (
            <span className="block text-xs text-kumo-danger">
              {state.error}
            </span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-kumo-accent hover:underline"
            onClick={() => onDrillIn(state)}
          >
            <ArrowSquareOutIcon size={12} />
            Open subagent drill-in
          </button>
        </div>
      )}
    </Surface>
  );
}

export function ToolPartView({
  part,
  helperStates,
  onDrillIn,
  addToolApprovalResponse
}: {
  part: Parameters<typeof getToolName>[0];
  helperStates: HelperState[];
  onDrillIn: (state: HelperState) => void;
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  const toolName = getToolName(part);
  const input = "input" in part ? part.input : undefined;
  const output = "output" in part ? part.output : undefined;

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
              {JSON.stringify(input, null, 2)}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
        <div className="flex items-center gap-2 mb-1">
          <GearIcon
            size={14}
            className={
              part.state === "input-available" ||
              part.state === "input-streaming"
                ? "text-kumo-inactive animate-spin"
                : "text-kumo-inactive"
            }
          />
          <Text size="xs" variant="secondary" bold>
            {toolName}
          </Text>
          <Badge
            variant={
              part.state === "output-error" ? "destructive" : "secondary"
            }
          >
            {part.state === "output-available"
              ? "Done"
              : part.state === "output-denied"
                ? "Rejected"
                : part.state === "input-available" ||
                    part.state === "input-streaming"
                  ? "Running"
                  : part.state}
          </Badge>
        </div>
        {helperStates.map((helper) => (
          <HelperRunView
            key={helper.helperId}
            state={helper}
            onDrillIn={onDrillIn}
          />
        ))}
        {output != null &&
          helperStates.length === 0 &&
          (typeof output === "string" ? (
            <Streamdown
              className="sd-theme rounded-md bg-kumo-elevated p-2 text-xs"
              plugins={{ code }}
              controls={false}
            >
              {output}
            </Streamdown>
          ) : (
            <div className="font-mono">
              <Text size="xs" variant="secondary">
                {JSON.stringify(output, null, 2)}
              </Text>
            </div>
          ))}
      </Surface>
    </div>
  );
}

function DrillInMessageParts({ message }: { message: UIMessage }) {
  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <Streamdown
              key={index}
              className="sd-theme rounded-xl bg-kumo-base p-3 text-sm"
              plugins={{ code }}
              controls={false}
            >
              {part.text}
            </Streamdown>
          );
        }
        if (part.type === "reasoning") {
          const text = (part as { text?: string }).text;
          if (!text) return null;
          return (
            <Surface
              key={index}
              className="rounded-xl ring ring-kumo-line p-3 opacity-80"
            >
              <div className="flex items-center gap-2 mb-1">
                <BrainIcon size={14} className="text-kumo-inactive" />
                <Text size="xs" variant="secondary" bold>
                  Reasoning
                </Text>
              </div>
              <pre className="text-xs text-kumo-subtle whitespace-pre-wrap">
                {text}
              </pre>
            </Surface>
          );
        }
        if (isToolUIPart(part)) {
          const input = "input" in part ? part.input : undefined;
          const output = "output" in part ? part.output : undefined;
          return (
            <Surface key={index} className="rounded-xl ring ring-kumo-line p-3">
              <div className="flex items-center gap-2">
                <GearIcon size={14} className="text-kumo-inactive" />
                <Text size="xs" variant="secondary" bold>
                  {getToolName(part)}
                </Text>
                <Badge variant="secondary">{part.state}</Badge>
              </div>
              {(input != null || output != null) && (
                <pre className="mt-2 text-xs text-kumo-subtle whitespace-pre-wrap overflow-auto max-h-56">
                  {JSON.stringify(output ?? input, null, 2)}
                </pre>
              )}
            </Surface>
          );
        }
        return null;
      })}
    </div>
  );
}

export function DrillInPanelFallback({
  helper,
  onClose
}: {
  helper: HelperState;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="flex-1 bg-black/40 cursor-pointer"
        onClick={onClose}
        aria-label="Close subagent drill-in"
      />
      <Surface className="w-full max-w-2xl flex flex-col border-l border-kumo-line">
        <header className="border-b border-kumo-line px-4 py-3 flex items-center gap-3 shrink-0">
          <RobotIcon size={20} className="text-kumo-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <Text size="sm" bold>
              {helper.helperType}
            </Text>
            <span className="block truncate">
              <Text size="xs" variant="secondary">
                {helper.query || helper.helperId}
              </Text>
            </span>
          </div>
          <Button
            variant="ghost"
            shape="square"
            aria-label="Close subagent drill-in"
            icon={<XIcon size={16} />}
            onClick={onClose}
          />
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <Text size="xs" variant="secondary">
            Connecting to subagent...
          </Text>
        </div>
      </Surface>
    </div>
  );
}

export function DrillInPanel({
  chatId,
  helper,
  onClose
}: {
  chatId: string;
  helper: HelperState;
  onClose: () => void;
}) {
  const isKnownHelperType = KNOWN_HELPER_TYPES.has(helper.helperType);
  const helperAgent = useAgent({
    agent: "inbox",
    name: DEMO_USER,
    sub: [
      { agent: "chat", name: chatId },
      {
        agent: isKnownHelperType
          ? helperAgentName(helper.helperType)
          : "researcher",
        name: helper.helperId
      }
    ]
  });
  const { messages } = useAgentChat({
    agent: helperAgent
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="flex-1 bg-black/40 cursor-pointer"
        onClick={onClose}
        aria-label="Close subagent drill-in"
      />
      <Surface className="w-full max-w-2xl flex flex-col border-l border-kumo-line">
        <header className="border-b border-kumo-line px-4 py-3 flex items-center gap-3 shrink-0">
          <RobotIcon size={20} className="text-kumo-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <Text size="sm" bold>
              {helper.helperType}
            </Text>
            <span className="block truncate">
              <Text size="xs" variant="secondary">
                {helper.query || helper.helperId}
              </Text>
            </span>
          </div>
          <Badge
            variant={helper.status === "error" ? "destructive" : "secondary"}
          >
            {helper.status === "running"
              ? "Running"
              : helper.status === "done"
                ? "Done"
                : "Error"}
          </Badge>
          <Button
            variant="ghost"
            shape="square"
            aria-label="Close subagent drill-in"
            icon={<XIcon size={16} />}
            onClick={onClose}
          />
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {!isKnownHelperType ? (
            <Surface className="rounded-xl ring ring-kumo-line p-4">
              <Text size="sm" bold>
                Unknown helper class: {helper.helperType}
              </Text>
              <span className="mt-1 block">
                <Text size="xs" variant="secondary">
                  Drill-in can only route to helper classes registered in this
                  starter: {[...KNOWN_HELPER_TYPES].join(", ")}.
                </Text>
              </span>
            </Surface>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Text size="xs" variant="secondary">
                Connecting to subagent...
              </Text>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-1">
                <Text size="xs" variant="secondary">
                  {message.role}
                </Text>
                <DrillInMessageParts message={message} />
              </div>
            ))
          )}
        </div>

        <div className="border-t border-kumo-line px-4 py-3 shrink-0">
          <Text size="xs" variant="secondary">
            Readonly drill-in. Follow up in the main chat to run another helper.
          </Text>
        </div>
      </Surface>
    </div>
  );
}
