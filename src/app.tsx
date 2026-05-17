import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import { useAgent } from "agents/react";
import type { MCPServersState } from "agents";
import type { ChatSummary, InboxState } from "./server";
import { Badge, Button, Switch, Text } from "@cloudflare/kumo";
import { Toasty } from "@cloudflare/kumo/components/toast";
import {
  BugIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  TrashIcon
} from "@phosphor-icons/react";
import { DEMO_USER } from "./constants";
import { ActiveChat } from "./components/active-chat";
import { McpPanel } from "./components/mcp-panel";

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

function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
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
  );
}

function ChatPaneFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-kumo-elevated">
      <Text size="xs" variant="secondary">
        Connecting to chat...
      </Text>
    </div>
  );
}

function ChatShell() {
  const [inboxConnected, setInboxConnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSwitchingChat, startChatTransition] = useTransition();
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const createdInitialChat = useRef(false);

  const inbox = useAgent<InboxState>({
    agent: "inbox",
    name: DEMO_USER,
    onOpen: useCallback(() => setInboxConnected(true), []),
    onClose: useCallback(() => setInboxConnected(false), []),
    onMcpUpdate: useCallback((state: MCPServersState) => {
      setMcpState(state);
    }, [])
  });

  const chats: ChatSummary[] = useMemo(
    () => inbox.state?.chats ?? [],
    [inbox.state]
  );

  useEffect(() => {
    if (chats.length === 0) {
      if (!createdInitialChat.current && inboxConnected) {
        createdInitialChat.current = true;
        void (async () => {
          const created = (await inbox.call("ensureChat")) as ChatSummary;
          startChatTransition(() => {
            setActiveId(created.id);
          });
        })();
      }
      return;
    }
    if (!activeId || !chats.some((chat) => chat.id === activeId)) {
      startChatTransition(() => {
        setActiveId(chats[0].id);
      });
    }
  }, [activeId, chats, inbox, inboxConnected, startChatTransition]);

  const createChat = useCallback(async () => {
    const created = (await inbox.call("createChat")) as ChatSummary;
    startChatTransition(() => {
      setActiveId(created.id);
    });
  }, [inbox, startChatTransition]);

  const deleteChat = useCallback(
    async (id: string) => {
      await inbox.call("deleteChat", [id]);
      if (activeId === id) {
        startChatTransition(() => {
          setActiveId(null);
        });
      }
    },
    [activeId, inbox, startChatTransition]
  );

  const renameChat = useCallback(
    async (id: string) => {
      const title = window.prompt("New chat title");
      if (!title?.trim()) return;
      await inbox.call("renameChat", [id, title.trim()]);
    },
    [inbox]
  );

  const addServer = useCallback(
    async (name: string, url: string) => {
      await inbox.call("addServer", [name, url]);
    },
    [inbox]
  );

  const removeServer = useCallback(
    async (serverId: string) => {
      await inbox.call("removeServer", [serverId]);
    },
    [inbox]
  );

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-kumo-default">
              <span className="mr-2">::</span>Agent Starter
            </h1>
            <Badge variant="secondary">
              <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
              Multi Chat
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <ConnectionIndicator connected={inboxConnected} />
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
            <McpPanel
              mcpState={mcpState}
              addServer={addServer}
              removeServer={removeServer}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-72 shrink-0 border-r border-kumo-line bg-kumo-base flex flex-col">
          <div className="p-3 border-b border-kumo-line flex items-center justify-between">
            <Text size="sm" bold>
              Chats
            </Text>
            <Button
              size="sm"
              onClick={createChat}
              icon={<PlusIcon size={14} />}
              disabled={!inboxConnected}
            >
              New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="p-4 text-center">
                <Text size="xs" variant="secondary">
                  Creating your first chat...
                </Text>
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`border-b border-kumo-line hover:bg-kumo-hover flex items-stretch gap-2 ${
                    chat.id === activeId ? "bg-kumo-hover" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left p-3 cursor-pointer"
                    aria-label={`Open ${chat.title}`}
                    onClick={() => {
                      startChatTransition(() => {
                        setActiveId(chat.id);
                      });
                    }}
                  >
                    <div className="min-w-0">
                      <Text size="sm" bold>
                        {chat.title}
                      </Text>
                      <div className="mt-0.5 truncate">
                        <Text size="xs" variant="secondary">
                          {chat.lastMessagePreview ?? "No messages yet"}
                        </Text>
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-col gap-1 py-3 pr-3">
                    <Button
                      variant="ghost"
                      shape="square"
                      size="sm"
                      aria-label="Rename chat"
                      onClick={(event) => {
                        event.stopPropagation();
                        renameChat(chat.id);
                      }}
                      icon={<PencilIcon size={12} />}
                    />
                    <Button
                      variant="ghost"
                      shape="square"
                      size="sm"
                      aria-label="Delete chat"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteChat(chat.id);
                      }}
                      icon={<TrashIcon size={12} />}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {activeId ? (
          <div className="flex flex-1 min-w-0 relative">
            {isSwitchingChat && (
              <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-kumo-base px-3 py-1.5 shadow-sm ring ring-kumo-line">
                <Text size="xs" variant="secondary">
                  Switching chats...
                </Text>
              </div>
            )}
            <Suspense fallback={<ChatPaneFallback />}>
              <ActiveChat
                key={activeId}
                chatId={activeId}
                inboxConnected={inboxConnected}
                showDebug={showDebug}
              />
            </Suspense>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Text variant="secondary">Select or create a chat.</Text>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <ChatShell />
      </Suspense>
    </Toasty>
  );
}
