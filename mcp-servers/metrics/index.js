#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'metrics-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Minimal stub tools - full implementation in Phase 2
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_error_rate',
        description: 'Get error rate for a service over a given time range (e.g. 15m, 1h)',
        inputSchema: {
          type: 'object',
          properties: {
            service: { type: 'string', description: 'Target service name' },
            time_range: { type: 'string', description: 'Time range (e.g., "15m", "1h")' },
          },
          required: ['service'],
        },
      },
      {
        name: 'get_latency',
        description: 'Get p95 latency in ms for a service over a given time range',
        inputSchema: {
          type: 'object',
          properties: {
            service: { type: 'string', description: 'Target service name' },
            time_range: { type: 'string', description: 'Time range (e.g., "15m", "1h")' },
          },
          required: ['service'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === 'get_error_rate') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ rate: 0.01, timestamp: new Date().toISOString() }),
        },
      ],
    };
  }

  if (name === 'get_latency') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ p95_ms: 120.5, timestamp: new Date().toISOString() }),
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
  console.error('Fatal error in metrics MCP server:', error);
  process.exit(1);
});
