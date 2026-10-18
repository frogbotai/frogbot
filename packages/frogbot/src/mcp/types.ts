import type { mcpServerMarker } from './server.js';

export type MCPServerTimeout = {
  /** Milliseconds to start the server and finish the handshake. Defaults to 30 seconds. */
  startup?: number;
  /** Milliseconds to list the server's tools on each run. Defaults to 30 seconds. */
  catalog?: number;
  /** Milliseconds one tool call may run. Defaults to 12 hours. */
  execution?: number;
};

export type MCPServerLocalOptions = {
  name: string;
  type: 'local';
  /** The program and its arguments, for example `['npx', '-y', '@frogbotai/sidekick-mcp']`. */
  command: readonly string[];
  cwd?: string;
  /** Added to FrogBot's own environment. */
  environment?: Record<string, string>;
  timeout?: MCPServerTimeout;
};

export type MCPServerRemoteOptions = {
  name: string;
  type: 'remote';
  /** A Streamable HTTP endpoint. */
  url: string;
  headers?: Record<string, string>;
  timeout?: MCPServerTimeout;
};

export type MCPServerOptions = MCPServerLocalOptions | MCPServerRemoteOptions;

export type MCPServer = Readonly<MCPServerOptions> & { readonly [mcpServerMarker]: true };
