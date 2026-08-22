import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import app from '../victim-app/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT_DIR, 'victim-app/data/active_state.json');
const DEPLOYS_FILE = path.join(ROOT_DIR, 'victim-app/data/deploys.json');

async function callMcpErrorRate() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(ROOT_DIR, 'mcp-servers/metrics/index.js')],
  });
  const client = new Client({ name: 'verify-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  const res = await client.callTool({
    name: 'get_error_rate',
    arguments: { service: 'checkout', time_range: '15m' },
  });
  await transport.close();
  return JSON.parse(res.content[0].text);
}

async function simulateTraffic(port, requests = 1000) {
  const res = await fetch(`http://localhost:${port}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  return await res.json();
}

async function run() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(4002, resolve));

  const deploys = JSON.parse(fs.readFileSync(DEPLOYS_FILE, 'utf-8'));
  const results = [];

  try {
    for (const d of deploys) {
      // 1. Set active state
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        service: 'checkout',
        active_deploy: d.id,
        active_tag: d.tag,
        last_updated: new Date().toISOString(),
      }, null, 2));

      // 2. Simulate 1,000 requests
      const sim = await simulateTraffic(4002, 1000);

      // 3. Query Metrics MCP
      const mcp = await callMcpErrorRate();

      results.push({
        deploy: d.id,
        tag: d.tag,
        summary: d.summary,
        simulated_failures: `${sim.failures} / 1000`,
        measured_error_rate: `${(mcp.rate * 100).toFixed(2)}%`,
        status: mcp.rate < 0.05 ? 'HEALTHY (< 1%)' : 'DEGRADED (> 20%)',
        raw_mcp_response: mcp,
      });
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    // Reset back to deploy-5 as current active broken state
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-5',
      active_tag: 'v1.3.0',
      last_updated: new Date().toISOString(),
    }, null, 2));
    await simulateTraffic(4002, 1000);
    server.close();
  }
}

run().catch(console.error);
