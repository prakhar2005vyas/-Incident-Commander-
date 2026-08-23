#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import app from '../victim-app/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT_DIR, 'victim-app/data/active_state.json');

async function testCorruptionAndRecovery() {
  console.log('========================================================');
  console.log('Testing Active State Non-Latching Corruption & Recovery');
  console.log('========================================================\n');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(4005, resolve));

  try {
    // 1. Initial healthy read (deploy-5)
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-5',
      active_tag: 'v1.3.0',
      last_updated: new Date().toISOString(),
    }, null, 2));

    const res1 = await fetch('http://localhost:4005/health');
    const data1 = await res1.json();
    console.log('[Step 1] Normal read output:');
    console.log(JSON.stringify(data1, null, 2));
    if (data1.active_deploy !== 'deploy-5') {
      throw new Error(`Expected deploy-5 on initial read, got ${data1.active_deploy}`);
    }

    // 2. Corrupt active_state.json with completely invalid JSON
    console.log('\n[Step 2] Corrupting active_state.json with malformed syntax...');
    fs.writeFileSync(STATE_FILE, '<<<BAD_CORRUPT_JSON_DATA>>>');

    const res2 = await fetch('http://localhost:4005/health');
    const data2 = await res2.json();
    console.log('[Step 2] Read output during corruption (graceful fallback):');
    console.log(JSON.stringify(data2, null, 2));
    if (!data2.active_deploy) {
      throw new Error('Server failed to return valid response during file corruption');
    }

    // 3. Restore active_state.json with deploy-2
    console.log('\n[Step 3] Restoring active_state.json with valid deploy-2 state...');
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-2',
      active_tag: 'v1.1.0',
      last_updated: new Date().toISOString(),
    }, null, 2));

    // 4. Confirm the very next read picks up deploy-2 from restored disk file
    const res3 = await fetch('http://localhost:4005/health');
    const data3 = await res3.json();
    console.log('[Step 4] Read output immediately after restoration:');
    console.log(JSON.stringify(data3, null, 2));
    if (data3.active_deploy !== 'deploy-2') {
      throw new Error(`Expected deploy-2 from restored disk file, but server returned ${data3.active_deploy} (stuck in fallback latch)`);
    }
    console.log('\n[SUCCESS] Server dynamically picked up restored file without being stuck in fallback latch!\n');

  } finally {
    // Reset back to deploy-5
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      service: 'checkout',
      active_deploy: 'deploy-5',
      active_tag: 'v1.3.0',
      last_updated: new Date().toISOString(),
    }, null, 2));
    server.close();
  }
}

testCorruptionAndRecovery().catch(err => {
  console.error('[FAILED] Test error:', err);
  process.exit(1);
});
