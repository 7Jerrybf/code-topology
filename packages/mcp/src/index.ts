#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TopologyState } from './state.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'code-topology',
  version: '0.1.0',
});

const state = new TopologyState();

registerResources(server, state);
registerTools(server, state);

const transport = new StdioServerTransport();
await server.connect(transport);
