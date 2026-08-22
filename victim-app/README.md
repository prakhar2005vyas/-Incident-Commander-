# Victim App — Toy Checkout Service

A lightweight Express service simulating a production e-commerce checkout flow with real failure telemetry and seeded deployment versions.

---

## Seeded Deploy History

The victim service contains 5 sequential deployment states:
- **`deploy-1` (`v1.0.0`)**: Initial checkout release. (Error rate: `0.8%`, p95: `120ms`, Status: Healthy)
- **`deploy-2` (`v1.1.0`)**: Cart serialization fix. (Error rate: `0.9%`, p95: `115ms`, Status: Healthy)
- **`deploy-3` (`v1.2.0`)**: **[Culprit Deploy]** Raised gateway timeout to 10s & removed retry backoff. (Error rate: `24.5%`, p95: `2850ms`, Status: Degraded)
- **`deploy-4` (`v1.2.1`)**: Checkout button text styling. (Error rate: `26.1%`, p95: `2920ms`, Status: Degraded)
- **`deploy-5` (`v1.3.0`)**: Active deploy with banner. (Error rate: `27.8%`, p95: `3100ms`, Status: Degraded)

---

## API Endpoints

- `GET /health`: Returns service operational health, error rate, and active deploy version.
- `POST /checkout`: Handles purchase request, failing intermittently with HTTP 504 based on the active deploy error rate.
- `GET /metrics`: Observability endpoint providing current and historical telemetry snapshots.
- `POST /simulate`: Triggers a batch of simulated transactions and logs metrics snapshots to `data/metrics_store.json`.

---

## Running Locally

```bash
node victim-app/server.js
```
The server will start on `http://localhost:4000`.
