#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../victim-app/data');
const METRICS_FILE = path.join(DATA_DIR, 'metrics_store.json');

function readMetrics(service) {
  const serviceKey = (service || 'checkout').toLowerCase();
  try {
    if (fs.existsSync(METRICS_FILE)) {
      const data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
      if (data[serviceKey]?.current) {
        return data[serviceKey].current;
      }
    }
  } catch (err) {
    console.error(`Error reading metrics store: ${err.message}`);
  }
  // Fallback default snapshot
  return { rate: 0.278, p95_ms: 3100.0, timestamp: new Date().toISOString() };
}

const server = new Server(
  {
    name: 'metrics-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_error_rate',
        description: 'Fetch the real-time error rate for a specified service over a given time window (e.g. 5m, 15m, 1h).',
        inputSchema: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description: 'The target service name (e.g. "checkout")',
            },
            time_range: {
              type: 'string',
              description: 'Time window for aggregation (e.g. "5m", "15m", "1h")',
            },
          },
          required: ['service'],
        },
      },
      {
        name: 'get_latency',
        description: 'Fetch the p95 latency in milliseconds for a specified service.',
        inputSchema: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description: 'The target service name (e.g. "checkout")',
            },
            time_range: {
              type: 'string',
              description: 'Time window for aggregation (e.g. "5m", "15m", "1h")',
            },
          },
          required: ['service'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const service = args?.service;

  if (!service || typeof service !== 'string' || service.trim() === '') {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Missing required parameter: service' }),
        },
      ],
    };
  }

  const metrics = readMetrics(service);

  if (name === 'get_error_rate') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            rate: metrics.rate,
            timestamp: metrics.timestamp || new Date().toISOString(),
          }),
        },
      ],
    };
  }

  if (name === 'get_latency') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            p95_ms: metrics.p95_ms,
            timestamp: metrics.timestamp || new Date().toISOString(),
          }),
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
