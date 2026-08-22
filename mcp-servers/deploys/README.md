# Deploys MCP Server

Model Context Protocol (MCP) server providing read-only access to deployment history and commit diffs.

### Tools:
- `list_recent_deploys(service)`: Lists recent deployments with id, timestamp, and commit summary.
- `get_deploy_diff(deploy_id)`: Fetches code diff changes introduced in the specified deploy.
