import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'active_state.json');
const DEPLOYS_FILE = path.join(DATA_DIR, 'deploys.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics_store.json');

function getActiveDeploy() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    const deploys = JSON.parse(fs.readFileSync(DEPLOYS_FILE, 'utf-8'));
    const active = deploys.find(d => d.id === state.active_deploy) || deploys[deploys.length - 1];
    return { ...active, state_updated_at: state.last_updated };
  } catch {
    return { id: 'deploy-5', error_rate: 0.278, p95_latency_ms: 3100.0, status: 'unhealthy' };
  }
}

function getMetricsStore() {
  try {
    return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
  } catch {
    return { checkout: { current: { rate: 0.278, p95_ms: 3100.0, timestamp: new Date().toISOString() } } };
  }
}

// Health status endpoint
app.get('/health', (req, res) => {
  const active = getActiveDeploy();
  res.json({
    service: 'checkout',
    status: active.error_rate > 0.05 ? 'DEGRADED' : 'HEALTHY',
    active_deploy: active.id,
    error_rate: active.error_rate,
    p95_latency_ms: active.p95_latency_ms,
    timestamp: new Date().toISOString(),
  });
});

// Observability metrics endpoint
app.get('/metrics', (req, res) => {
  const store = getMetricsStore();
  res.json(store.checkout || {});
});

// Core checkout endpoint
app.post('/checkout', (req, res) => {
  const active = getActiveDeploy();
  const { cart_id = 'cart-default', amount = 49.99, user_id = 'user-anon' } = req.body || {};

  // Simulated latency jitter around p95
  const simulatedLatency = active.error_rate > 0.05 ? Math.floor(2000 + Math.random() * 1500) : Math.floor(80 + Math.random() * 60);

  // Failure probability determined by active deploy error rate
  const hasFailed = Math.random() < active.error_rate;

  setTimeout(() => {
    if (hasFailed) {
      return res.status(504).json({
        success: false,
        error: 'PaymentGatewayTimeout: Connection timed out after 10000ms',
        deploy_version: active.id,
        latency_ms: simulatedLatency,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      order_id: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      cart_id,
      amount,
      user_id,
      deploy_version: active.id,
      latency_ms: simulatedLatency,
      timestamp: new Date().toISOString(),
    });
  }, 20);
});

// Traffic simulation trigger
app.post('/simulate', (req, res) => {
  const { requests = 100 } = req.body || {};
  const active = getActiveDeploy();
  let failures = 0;

  for (let i = 0; i < requests; i++) {
    if (Math.random() < active.error_rate) failures++;
  }

  const measuredRate = Number((failures / requests).toFixed(4));
  const timestamp = new Date().toISOString();

  const store = getMetricsStore();
  store.checkout = store.checkout || { history: [] };
  store.checkout.current = {
    rate: measuredRate,
    p95_ms: active.p95_latency_ms,
    timestamp,
    deploy_id: active.id,
    sample_count: requests,
  };

  try {
    fs.writeFileSync(METRICS_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Failed to persist metrics store:', err);
  }

  res.json({
    simulated_requests: requests,
    failures,
    measured_error_rate: measuredRate,
    active_deploy: active.id,
    timestamp,
  });
});

const PORT = process.env.PORT || 4000;
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  app.listen(PORT, () => {
    console.log(`Victim Checkout Service listening on http://localhost:${PORT}`);
  });
}

export default app;
