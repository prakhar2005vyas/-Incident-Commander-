#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'deploys-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Minimal stub tools - full implementation in Phase 3
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_recent_deploys',
        description: 'List recent deployments for a service',
        inputSchema: {
          type: 'object',
          properties: {
            service: { type: 'string', description: 'Target service name' },
          },
          required: ['service'],
        },
      },
      {
        name: 'get_deploy_diff',
        description: 'Get code changes/diff introduced by a specific deploy id',
        inputSchema: {
          type: 'object',
          properties: {
            deploy_id: { type: 'string', description: 'Deploy ID / tag / commit hash' },
          },
          required: ['deploy_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'list_recent_deploys') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { id: 'deploy-5', timestamp: new Date().toISOString(), summary: 'Add caching layer' },
            { id: 'deploy-4', timestamp: new Date(Date.now() - 3600000).toISOString(), summary: 'Update retry count' },
            { id: 'deploy-3', timestamp: new Date(Date.now() - 7200000).toISOString(), summary: 'Bump gateway timeout' },
            { id: 'deploy-2', timestamp: new Date(Date.now() - 10800000).toISOString(), summary: 'Fix cart serialization' },
            { id: 'deploy-1', timestamp: new Date(Date.now() - 14400000).toISOString(), summary: 'Initial checkout release' },
          ]),
        },
      ],
    };
  }

  if (name === 'get_deploy_diff') {
    const deployId = args?.deploy_id || 'deploy-3';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ diff_text: `diff --git a/server.js b/server.js\n--- a/server.js\n+++ b/server.js\n@@ -12,3 +12,3 @@\n-const TIMEOUT_MS = 2000;\n+const TIMEOUT_MS = 10000;\n` }),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((error) => {
  console.error('Fatal error in deploys MCP server:', error);
  process.exit(1);
});
