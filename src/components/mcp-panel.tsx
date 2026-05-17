import { useEffect, useRef, useState } from "react";
import type { MCPServersState } from "agents";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import {
  PlugsConnectedIcon,
  PlusIcon,
  SignInIcon,
  TrashIcon,
  WrenchIcon,
  XIcon
} from "@phosphor-icons/react";

export function McpPanel({
  mcpState,
  addServer,
  removeServer
}: {
  mcpState: MCPServersState;
  addServer: (name: string, url: string) => Promise<void>;
  removeServer: (serverId: string) => Promise<void>;
}) {
  const [showMcpPanel, setShowMcpPanel] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [isAddingServer, setIsAddingServer] = useState(false);
  const mcpPanelRef = useRef<HTMLDivElement>(null);
  const serverEntries = Object.entries(mcpState.servers);
  const mcpToolCount = mcpState.tools.length;

  useEffect(() => {
    if (!showMcpPanel) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        mcpPanelRef.current &&
        !mcpPanelRef.current.contains(e.target as Node)
      ) {
        setShowMcpPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMcpPanel]);

  const handleAddServer = async () => {
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    setIsAddingServer(true);
    try {
      await addServer(mcpName.trim(), mcpUrl.trim());
      setMcpName("");
      setMcpUrl("");
    } catch (error) {
      console.error("Failed to add MCP server:", error);
    } finally {
      setIsAddingServer(false);
    }
  };

  return (
    <div className="relative" ref={mcpPanelRef}>
      <Button
        variant="secondary"
        icon={<PlugsConnectedIcon size={16} />}
        onClick={() => setShowMcpPanel(!showMcpPanel)}
      >
        MCP
        {mcpToolCount > 0 && (
          <Badge variant="primary" className="ml-1.5">
            <WrenchIcon size={10} className="mr-0.5" />
            {mcpToolCount}
          </Badge>
        )}
      </Button>

      {showMcpPanel && (
        <div className="absolute right-0 top-full mt-2 w-96 z-50">
          <Surface className="rounded-xl ring ring-kumo-line shadow-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlugsConnectedIcon size={16} className="text-kumo-accent" />
                <Text size="sm" bold>
                  Shared MCP Servers
                </Text>
                {serverEntries.length > 0 && (
                  <Badge variant="secondary">{serverEntries.length}</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                aria-label="Close MCP panel"
                icon={<XIcon size={14} />}
                onClick={() => setShowMcpPanel(false)}
              />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddServer();
              }}
              className="space-y-2"
            >
              <input
                type="text"
                value={mcpName}
                onChange={(e) => setMcpName(e.target.value)}
                aria-label="MCP server name"
                placeholder="Server name"
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  aria-label="MCP server URL"
                  placeholder="https://mcp.example.com"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent font-mono"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<PlusIcon size={14} />}
                  disabled={isAddingServer || !mcpName.trim() || !mcpUrl.trim()}
                >
                  {isAddingServer ? "..." : "Add"}
                </Button>
              </div>
            </form>

            {serverEntries.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {serverEntries.map(([id, server]) => (
                  <div
                    key={id}
                    className="flex items-start justify-between p-2.5 rounded-lg border border-kumo-line"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-kumo-default truncate">
                          {server.name}
                        </span>
                        <Badge
                          variant={
                            server.state === "ready"
                              ? "primary"
                              : server.state === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {server.state}
                        </Badge>
                      </div>
                      <span className="text-xs font-mono text-kumo-subtle truncate block mt-0.5">
                        {server.server_url}
                      </span>
                      {server.state === "failed" && server.error && (
                        <span className="text-xs text-red-500 block mt-0.5">
                          {server.error}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {server.state === "authenticating" && server.auth_url && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<SignInIcon size={12} />}
                          onClick={() =>
                            window.open(
                              server.auth_url as string,
                              "oauth",
                              "width=600,height=800"
                            )
                          }
                        >
                          Auth
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="square"
                        aria-label="Remove server"
                        icon={<TrashIcon size={12} />}
                        onClick={() => removeServer(id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mcpToolCount > 0 && (
              <div className="pt-2 border-t border-kumo-line">
                <div className="flex items-center gap-2">
                  <WrenchIcon size={14} className="text-kumo-subtle" />
                  <span className="text-xs text-kumo-subtle">
                    {mcpToolCount} tool{mcpToolCount !== 1 ? "s" : ""} available
                    to every chat
                  </span>
                </div>
              </div>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
