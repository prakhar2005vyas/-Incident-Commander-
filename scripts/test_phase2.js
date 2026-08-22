#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function testPhase2() {
  console.log('========================================================');
  console.log('Phase 2 Verification: Victim App & Metrics MCP Server');
  console.log('========================================================\n');

  // 1. Verify files exist
  const requiredFiles = [
    'victim-app/server.js',
    'victim-app/data/deploys.json',
    'victim-app/data/active_state.json',
    'victim-app/data/metrics_store.json',
    'mcp-servers/metrics/index.js',
  ];

  for (const rel of requiredFiles) {
    const p = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(p)) {
      throw new Error(`Missing expected file: ${rel}`);
    }
    console.log(`[OK] Found ${rel}`);
  }

  // 2. Test Deploys Data
  const deploys = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'victim-app/data/deploys.json'), 'utf-8'));
  console.log(`\n[OK] Loaded ${deploys.length} seeded deploys:`);
  deploys.forEach(d => {
    console.log(`     ${d.id} (${d.tag}) - Error rate: ${(d.error_rate * 100).toFixed(1)}%, p95: ${d.p95_latency_ms}ms -> ${d.summary}`);
  });

  // 3. Connect to Metrics MCP Server via stdio
  console.log('\n--- Connecting to Metrics MCP Server via stdio ---');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(ROOT_DIR, 'mcp-servers/metrics/index.js')],
  });

  const client = new Client(
    { name: 'phase2-tester', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // List tools
  const tools = await client.listTools();
  console.log('[OK] MCP Tools listed:', tools.tools.map(t => t.name));

  // Call get_error_rate
  const errRes = await client.callTool({
    name: 'get_error_rate',
    arguments: { service: 'checkout', time_range: '15m' },
  });
  const errData = JSON.parse(errRes.content[0].text);
  console.log('\n[Tool Output] get_error_rate("checkout", "15m"):', errData);
  if (typeof errData.rate !== 'number' || !errData.timestamp) {
    throw new Error('Invalid schema from get_error_rate');
  }

  // Call get_latency
  const latRes = await client.callTool({
    name: 'get_latency',
    arguments: { service: 'checkout', time_range: '15m' },
  });
  const latData = JSON.parse(latRes.content[0].text);
  console.log('[Tool Output] get_latency("checkout", "15m"):', latData);
  if (typeof latData.p95_ms !== 'number' || !latData.timestamp) {
    throw new Error('Invalid schema from get_latency');
  }

  // Test missing parameter rejection
  const invalidRes = await client.callTool({
    name: 'get_error_rate',
    arguments: {},
  });
  console.log('[Tool Output] Rejection on missing service:', JSON.parse(invalidRes.content[0].text));

  await transport.close();
  console.log('\n[SUCCESS] Phase 2 validation complete: All checks passed!\n');
}

testPhase2().catch(err => {
  console.error('[FAILED] Phase 2 verification failed:', err);
  process.exit(1);
});
