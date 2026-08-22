# Rollback MCP Server

Model Context Protocol (MCP) server providing the state-changing rollback action.

> **CRITICAL SAFETY NOTE:** This tool is write-capable and irreversible. It is gated behind explicit human approval in the Incident Commander harness before execution.

### Tools:
- `rollback_to(deploy_id)`: Rolls back the active deployment version to the targeted healthy deploy id.
