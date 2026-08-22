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
            { id: 'v1.0.0', timestamp: new Date().toISOString(), summary: 'Initial stable release' },
          ]),
        },
      ],
    };
  }

  if (name === 'get_deploy_diff') {
    const deployId = args?.deploy_id || 'unknown';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ deploy_id: deployId, diff_text: 'Stub diff for deploy ' + deployId }),
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
