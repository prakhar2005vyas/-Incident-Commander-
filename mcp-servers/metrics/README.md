# Metrics MCP Server

Model Context Protocol (MCP) server providing read-only access to victim-app telemetry data directly from `victim-app/data/metrics_store.json`.

---

## Tools

### 1. `get_error_rate`
Fetches real-time error rate for a service over a given aggregation time window.
- **Parameters:**
  - `service` (string, required): Service identifier (e.g. `"checkout"`).
  - `time_range` (string, optional): Time range window (e.g. `"15m"`, `"1h"`).
- **Response Format:**
  ```json
  {
    "rate": 0.278,
    "timestamp": "2026-08-23T04:30:00.000Z"
  }
  ```

### 2. `get_latency`
Fetches p95 latency in milliseconds for a service.
- **Parameters:**
  - `service` (string, required): Service identifier (e.g. `"checkout"`).
  - `time_range` (string, optional): Time range window (e.g. `"15m"`, `"1h"`).
- **Response Format:**
  ```json
  {
    "p95_ms": 3100.0,
    "timestamp": "2026-08-23T04:30:00.000Z"
  }
  ```

---

## Running Standalone

```bash
node mcp-servers/metrics/index.js
```
Communicates over standard input/output (stdio JSON-RPC).
