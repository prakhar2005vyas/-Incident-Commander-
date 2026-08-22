# -Incident-Commander- 

An incident-commander agent built on TrueForge for the Agent Harness Hackathon.

When an alert fires, this agent investigates on its own — pulls metrics,
checks recent deploys, and runs a bisection script in a sandbox to find
the deploy that caused it — then stops and asks a human before rolling
anything back.

## Status
🚧 Work in progress — built during the TrueForge Agent Harness Hackathon.

## Stack
- [TrueForge](https://github.com/truefoundry/trueforge) — agent harness
- Groq + Gemini — model providers
- Daytona — sandboxed code execution
- Custom MCP servers — metrics, deploys, rollback

## Setup
Coming soon.
