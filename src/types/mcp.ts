export type McpConnection = {
  id: string;
  url: string;
  name?: string;
  connectionState: string;
  authUrl?: string;
  tools?: unknown[];
};
