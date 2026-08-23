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

async function callMcpErrorRate() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(ROOT_DIR, 'mcp-servers/metrics/index.js')],
  });
  const client = new Client({ name: 'verify-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  const res = await client.callTool({
    name: 'get_error_rate',
    arguments: { service: 'checkout', time_range: '5m' },
  });
  await transport.close();
  return JSON.parse(res.content[0].text);
}

async function simulateTraffic(port, requests = 500) {
  const res = await fetch(`http://localhost:${port}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  return await res.json();
}

async function run() {
  // Start server on temporary port 4001
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(4001, resolve));

  try {
    console.log('=== STEP 1: Current active_state.json ===');
    console.log(fs.readFileSync(STATE_FILE, 'utf-8'));

    console.log('\n=== STEP 2: Metrics MCP get_error_rate for checkout (Initial) ===');
    const initialMcp = await callMcpErrorRate();
    console.log(JSON.stringify(initialMcp, null, 2));

    console.log('\n=== STEP 3: Switch active_state.json to deploy-3 (the buggy deploy) ===');
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-3',
      active_tag: 'v1.2.0',
      last_updated: new Date().toISOString()
    }, null, 2));
    console.log(fs.readFileSync(STATE_FILE, 'utf-8'));

    console.log('\n=== STEP 4: Hit /simulate with 1000 requests on deploy-3 ===');
    const simDeploy3 = await simulateTraffic(4001, 1000);
    console.log(JSON.stringify(simDeploy3, null, 2));

    console.log('\n=== STEP 5: Call Metrics MCP get_error_rate after deploy-3 simulation ===');
    const mcpDeploy3 = await callMcpErrorRate();
    console.log(JSON.stringify(mcpDeploy3, null, 2));

    console.log('\n=== STEP 6: Switch active_state.json to deploy-2 (Healthy rollback target) & simulate ===');
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-2',
      active_tag: 'v1.1.0',
      last_updated: new Date().toISOString()
    }, null, 2));
    const simDeploy2 = await simulateTraffic(4001, 1000);
    console.log('Simulate on deploy-2 result:');
    console.log(JSON.stringify(simDeploy2, null, 2));
    const mcpDeploy2 = await callMcpErrorRate();
    console.log('Metrics MCP get_error_rate on deploy-2 (Healthy):');
    console.log(JSON.stringify(mcpDeploy2, null, 2));

    console.log('\n=== STEP 7: Switch back to deploy-5 (Unhealthy initial state) & simulate ===');
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-5',
      active_tag: 'v1.3.0',
      last_updated: new Date().toISOString()
    }, null, 2));
    const simDeploy5 = await simulateTraffic(4001, 1000);
    console.log('Simulate on deploy-5 result:');
    console.log(JSON.stringify(simDeploy5, null, 2));
    const mcpDeploy5 = await callMcpErrorRate();
    console.log('Metrics MCP get_error_rate on deploy-5:');
    console.log(JSON.stringify(mcpDeploy5, null, 2));

  } finally {
    server.close();
  }
}

run().catch(console.error);
