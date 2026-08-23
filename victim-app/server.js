import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'active_state.json');
const DEPLOYS_FILE = path.join(DATA_DIR, 'deploys.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics_store.json');

const HARDCODED_DEFAULT_DEPLOYS = [
  { id: 'deploy-1', tag: 'v1.0.0', summary: 'Initial checkout release', error_rate: 0.008, p95_latency_ms: 120.0, status: 'healthy' },
  { id: 'deploy-2', tag: 'v1.1.0', summary: 'Fix cart serialization bug on multi-item checkout', error_rate: 0.009, p95_latency_ms: 115.0, status: 'healthy' },
  { id: 'deploy-3', tag: 'v1.2.0', summary: 'Increase payment gateway timeout to 10s and remove retry backoff', error_rate: 0.245, p95_latency_ms: 2850.0, status: 'incident_culprit' },
  { id: 'deploy-4', tag: 'v1.2.1', summary: 'Update checkout button text and copy', error_rate: 0.261, p95_latency_ms: 2920.0, status: 'unhealthy' },
  { id: 'deploy-5', tag: 'v1.3.0', summary: 'Add order confirmation banner & analytics beacon', error_rate: 0.278, p95_latency_ms: 3100.0, status: 'unhealthy' },
];

const IN_MEMORY_DEFAULT_STATE = {
  service: 'checkout',
  active_deploy: 'deploy-5',
  active_tag: 'v1.3.0',
  last_updated: new Date().toISOString(),
};

const IN_MEMORY_DEFAULT_METRICS = {
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

// In-memory fallback state in case filesystem write fails - kept up-to-date with last known good read
let inMemoryState = { ...IN_MEMORY_DEFAULT_STATE };
let inMemoryMetrics = JSON.parse(JSON.stringify(IN_MEMORY_DEFAULT_METRICS));

// Safe reader for deploys catalog with hardcoded last-resort default
function readDeploysCatalog() {
  try {
    if (fs.existsSync(DEPLOYS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DEPLOYS_FILE, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[readDeploysCatalog] Error reading deploys.json, using hardcoded catalog fallback:', err.message);
  }
  return HARDCODED_DEFAULT_DEPLOYS;
}

// Ensure runtime data directory and default state files exist
function ensureRuntimeDataFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error(`[ensureRuntimeDataFiles] Failed to create data dir ${DATA_DIR}:`, err.message);
  }

  if (!fs.existsSync(STATE_FILE)) {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(IN_MEMORY_DEFAULT_STATE, null, 2));
    } catch (err) {
      console.error(`[ensureRuntimeDataFiles] Failed to write default state file ${STATE_FILE}:`, err.message);
    }
  }

  if (!fs.existsSync(METRICS_FILE)) {
    try {
      fs.writeFileSync(METRICS_FILE, JSON.stringify(IN_MEMORY_DEFAULT_METRICS, null, 2));
    } catch (err) {
      console.error(`[ensureRuntimeDataFiles] Failed to write default metrics file ${METRICS_FILE}:`, err.message);
    }
  }
}

ensureRuntimeDataFiles();

// Stateless active deploy reader: reads fresh from disk each call and updates inMemoryState to last known good on success
function getActiveDeploy() {
  const deploys = readDeploysCatalog();
  let state = inMemoryState;

  try {
    ensureRuntimeDataFiles();
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object' && parsed.active_deploy) {
        state = parsed;
        inMemoryState = parsed; // update in-memory state on every successful disk read
      }
    }
  } catch (err) {
    console.error('[getActiveDeploy] Error reading active_state.json, falling back to last known-good in-memory state:', err.message);
  }

  const active = deploys.find(d => d.id === state.active_deploy) || deploys[deploys.length - 1];
  return { ...active, state_updated_at: state.last_updated || new Date().toISOString() };
}

// Stateless metrics store reader: reads fresh from disk each call and updates inMemoryMetrics to last known good on success
function getMetricsStore() {
  try {
    ensureRuntimeDataFiles();
    if (fs.existsSync(METRICS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object' && parsed.checkout) {
        inMemoryMetrics = parsed; // update in-memory metrics on every successful disk read
        return parsed;
      }
    }
  } catch (err) {
    console.error('[getMetricsStore] Error reading metrics_store.json, falling back to last known-good in-memory metrics:', err.message);
  }
  return inMemoryMetrics;
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

  // NOTE: Simulated latency in response body vs actual HTTP delay is a known simplification; error rate is the primary signal for incident detection.
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

  // Validation: reject non-numeric or non-positive values to prevent NaN/Infinity
  if (typeof requests !== 'number' || !Number.isInteger(requests) || requests <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid requests count: requests must be a positive integer greater than 0',
    });
  }

  const active = getActiveDeploy();
  let failures = 0;

  for (let i = 0; i < requests; i++) {
    if (Math.random() < active.error_rate) failures++;
  }

  const measuredRate = Number((failures / requests).toFixed(4));
  const timestamp = new Date().toISOString();

  const store = getMetricsStore();
  store.checkout = store.checkout || {};
  store.checkout.current = {
    rate: measuredRate,
    p95_ms: active.p95_latency_ms,
    timestamp,
    deploy_id: active.id,
    sample_count: requests,
  };

  // Append to timeline history for Phase 5 bisection and Phase 7 UI
  if (!Array.isArray(store.checkout.history)) {
    store.checkout.history = [];
  }
  store.checkout.history.push({
    deploy_id: active.id,
    rate: measuredRate,
    p95_ms: active.p95_latency_ms,
    timestamp,
    sample_count: requests,
  });

  inMemoryMetrics = store;

  try {
    fs.writeFileSync(METRICS_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error(`[POST /simulate] Failed to persist metrics to ${METRICS_FILE}:`, err.message);
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
