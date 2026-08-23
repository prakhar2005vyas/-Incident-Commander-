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
const STATE_FILE = path.join(DATA_DIR, 'active_state.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics_store.json');

function ensureRuntimeDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STATE_FILE)) {
    const defaultState = {
      service: 'checkout',
      active_deploy: 'deploy-5',
      active_tag: 'v1.3.0',
      last_updated: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
    } catch {}
  }

  if (!fs.existsSync(METRICS_FILE)) {
    const defaultMetrics = {
      checkout: {
        current: {
          rate: 0.278,
          p95_ms: 3100.0,
          timestamp: new Date().toISOString(),
          deploy_id: 'deploy-5',
          sample_count: 1000,
        },
        history: [
          { deploy_id: 'deploy-1', rate: 0.008, p95_ms: 120.0, timestamp: '2026-08-22T19:30:00.000Z' },
          { deploy_id: 'deploy-2', rate: 0.009, p95_ms: 115.0, timestamp: '2026-08-22T20:30:00.000Z' },
          { deploy_id: 'deploy-3', rate: 0.245, p95_ms: 2850.0, timestamp: '2026-08-22T21:30:00.000Z' },
          { deploy_id: 'deploy-4', rate: 0.261, p95_ms: 2920.0, timestamp: '2026-08-22T22:30:00.000Z' },
          { deploy_id: 'deploy-5', rate: 0.278, p95_ms: 3100.0, timestamp: '2026-08-23T04:30:00.000Z' },
        ],
      },
    };
    try {
      fs.writeFileSync(METRICS_FILE, JSON.stringify(defaultMetrics, null, 2));
    } catch {}
  }
}

function readMetrics(service) {
  const serviceKey = (service || 'checkout').toLowerCase();
  try {
    ensureRuntimeDataFiles();
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
