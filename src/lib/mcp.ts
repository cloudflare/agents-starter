import type { McpConnection } from "../types/mcp";

export function mapMcpServersToConnections(
  mcpServersState: Record<string, unknown>
): McpConnection[] {
  return Object.entries(
    (mcpServersState as { servers?: Record<string, unknown> }).servers || {}
  ).map(([id, c]) => {
    const server = c as Record<string, unknown>;
    const capabilities = (server.capabilities as { tools?: unknown }) ?? {};
    return {
      id,
      url: server.server_url as string,
      name: server.name as string,
      connectionState: server.state as string,
      authUrl: (server.auth_url as string) ?? undefined,
      tools: Array.isArray(server.tools)
        ? server.tools
        : server.tools && typeof server.tools === "object"
          ? Object.values(server.tools)
          : capabilities && Array.isArray(capabilities.tools)
            ? capabilities.tools
            : capabilities && typeof capabilities.tools === "object"
              ? Object.values(capabilities.tools as object)
              : [],
    };
  });
}
