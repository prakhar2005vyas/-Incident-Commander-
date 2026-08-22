#!/usr/bin/env node
// NOTE: Known lower-priority test helper limitations (e.g. error isolation & test harness robustness) to revisit in later polish phases.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';

async function testServer(serverPath, toolCalls) {
  console.log(`\n========================================`);
  console.log(`Testing MCP Server: ${path.basename(path.dirname(serverPath))}`);
  console.log(`========================================`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  const toolsList = await client.listTools();
  console.log('Available Tools:', toolsList.tools.map(t => t.name));

  for (const call of toolCalls) {
    console.log(`\n--- Tool Call: ${call.name}(${JSON.stringify(call.args)}) ---`);
    const res = await client.callTool({
      name: call.name,
      arguments: call.args,
    });
    
    // Parse inner JSON if text
    const textContent = res.content?.[0]?.text;
    const parsedData = textContent ? JSON.parse(textContent) : null;
    
    console.log('Raw MCP Content:');
    console.log(JSON.stringify(res.content, null, 2));
    console.log('Parsed Payload:');
    console.log(parsedData);
  }

  await transport.close();
}

async function main() {
  // 1. Metrics MCP
  await testServer('./mcp-servers/metrics/index.js', [
    { name: 'get_error_rate', args: { service: 'checkout', time_range: '5m' } },
    { name: 'get_latency', args: { service: 'checkout', time_range: '5m' } },
  ]);

  // 2. Deploys MCP
  await testServer('./mcp-servers/deploys/index.js', [
    { name: 'list_recent_deploys', args: { service: 'checkout' } },
    { name: 'get_deploy_diff', args: { deploy_id: 'deploy-3' } },
  ]);

  // 3. Rollback MCP (testing valid target deploy and missing deploy_id rejection)
  await testServer('./mcp-servers/rollback/index.js', [
    { name: 'rollback_to', args: { deploy_id: 'deploy-2' } },
    { name: 'rollback_to', args: {} },
  ]);
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
