/**
 * Exposes the SwiftDrop tools over MCP stdio, so any MCP client (MCP Inspector,
 * Claude Desktop, ...) can use them directly:
 *
 *   npx @modelcontextprotocol/inspector npm run mcp:stdio -w apps/ai-assistant
 *
 * Without SWIFTDROP_TOKEN only the public tools are available (guest).
 * Set SWIFTDROP_TOKEN + SWIFTDROP_ROLE=CUSTOMER|MERCHANT to act as a user.
 * stdout carries the MCP protocol, so log only to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer, type ToolRole } from './server.js';

const token = process.env.SWIFTDROP_TOKEN || undefined;
const requested = process.env.SWIFTDROP_ROLE;
const role: ToolRole =
  token && (requested === 'CUSTOMER' || requested === 'MERCHANT') ? requested : 'GUEST';

const server = buildMcpServer({ role, token });
await server.connect(new StdioServerTransport());
console.error(`SwiftDrop MCP server running on stdio (role: ${role})`);
