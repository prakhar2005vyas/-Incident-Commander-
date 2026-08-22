#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'rollback-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Minimal stub tools - full implementation in Phase 3 / Phase 6
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'rollback_to',
        description: 'Rollback the active service deployment to a target deploy id (GATED ACTION)',
        inputSchema: {
          type: 'object',
          properties: {
            deploy_id: { type: 'string', description: 'Target deploy ID to rollback to' },
          },
          required: ['deploy_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'rollback_to') {
    const deployId = args?.deploy_id || 'deploy-2';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, new_active_deploy: deployId }),
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
  console.error('Fatal error in rollback MCP server:', error);
  process.exit(1);
});
