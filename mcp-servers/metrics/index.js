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

const DEFAULT_INITIAL_STATE = {
  service: 'checkout',
  active_deploy: 'deploy-5',
  active_tag: 'v1.3.0',
  last_updated: new Date().toISOString(),
};

const DEFAULT_INITIAL_METRICS = {
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

function ensureRuntimeDataFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error(`[ensureRuntimeDataFiles] Failed to create directory ${DATA_DIR}:`, err.message);
  }

  if (!fs.existsSync(STATE_FILE)) {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_INITIAL_STATE, null, 2));
    } catch (err) {
      console.error(`[ensureRuntimeDataFiles] Failed to write state file ${STATE_FILE}:`, err.message);
    }
  }

  if (!fs.existsSync(METRICS_FILE)) {
    try {
      fs.writeFileSync(METRICS_FILE, JSON.stringify(DEFAULT_INITIAL_METRICS, null, 2));
    } catch (err) {
      console.error(`[ensureRuntimeDataFiles] Failed to write metrics file ${METRICS_FILE}:`, err.message);
    }
  }
}

function readMetrics(service) {
  const serviceKey = (typeof service === 'string' ? service.trim() : 'checkout').toLowerCase();
  ensureRuntimeDataFiles();

  try {
    if (fs.existsSync(METRICS_FILE)) {
      const data = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
      if (data[serviceKey]?.current) {
        return { success: true, data: data[serviceKey].current };
      }
      return {
        success: false,
        error: `Service "${service}" not found in telemetry store (${METRICS_FILE})`,
      };
    }
    return {
      success: false,
      error: `Telemetry store file does not exist at ${METRICS_FILE}`,
    };
  } catch (err) {
    console.error(`[readMetrics] Error reading metrics store at ${METRICS_FILE}:`, err.message);
    return {
      success: false,
      error: `Failed to read metrics store (${METRICS_FILE}): ${err.message}`,
    };
  }
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
  const rawService = args?.service;

  if (!rawService || typeof rawService !== 'string' || rawService.trim() === '') {
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

  const normalizedService = rawService.trim();
  const result = readMetrics(normalizedService);

  if (!result.success) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: result.error }),
        },
      ],
    };
  }

  if (name === 'get_error_rate') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            rate: result.data.rate,
            timestamp: result.data.timestamp || new Date().toISOString(),
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
            p95_ms: result.data.p95_ms,
            timestamp: result.data.timestamp || new Date().toISOString(),
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
