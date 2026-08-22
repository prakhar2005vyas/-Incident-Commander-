# Root Cause — Build Plan
### An incident-commander agent for the TrueForge Agent Harness Hackathon

**How to use this document:** This is a full spec, written to be handed to Claude Code as a working brief. It is organized into phases. Each phase has a goal, concrete tasks, exact deliverables, and a "definition of done." Work through phases in order, open one small pull request per phase (or per task group within a phase), and let Qodo review each one before merging. Do not skip the Qodo step even under time pressure — the review trail is graded.

At the end there is an **MVP cut line**: if a phase runs long, cut down to the MVP version described there rather than skipping a phase entirely. Every phase has *some* minimum version that still counts.

---

## 0. One-line pitch

An alert fires. The agent investigates on its own — pulls metrics, checks recent deploys, runs a bisection script in a sandbox to find the deploy that caused it — then stops and asks a human before rolling anything back.

## 1. Why this project maps to the judging criteria

| Criterion | How this project earns it |
|---|---|
| Potential impact | A job every team running production software actually has |
| Creativity | Uses the exact "incident response" example TrueFoundry itself uses to explain the harness — low platform friction, high judge legibility |
| Technical excellence | Real MCP tools, real sandboxed code execution, real approval gate, real session persistence |
| Use of sponsor tools | TrueForge is structurally load-bearing (not a thin wrapper) + Qodo reviews every PR |
| Control and safety | The rollback action is hard-gated behind human approval — this is the whole point of the project |
| Presentation | One clean "ops room" screen tells the whole story in the demo video |

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                     TrueForge Harness                        │
│   (npx @truefoundry/trueforge — local mode, SQLite)          │
│                                                                │
│   Model: Groq (primary, fast) + Gemini (fallback/2nd voice)  │
│                                                                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│   │ metrics MCP  │  │ deploys MCP  │  │ rollback MCP │       │
│   │ (read-only)  │  │ (read-only)  │  │ (WRITE —     │       │
│   │              │  │              │  │  gated)      │       │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│          │                 │                  │               │
│   ┌──────▼─────────────────▼──────────────────▼───────┐      │
│   │              Sandbox (Daytona, free tier)           │      │
│   │     runs bisect.py against pulled metrics/deploys   │      │
│   └──────────────────────────────────────────────────────┘   │
│                                                                │
│   Approval checkpoint before rollback MCP is ever called      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │   Victim app (toy)       │
                 │   fake checkout service  │
                 │   + 4-5 seeded "deploys" │
                 └─────────────────────────┘
```

---

## 3. Accounts / setup needed before Phase 1 (all free)

- [ ] Node.js installed (for `npx @truefoundry/trueforge`)
- [ ] GitHub account + new **public** repo created
- [ ] Groq account → API key from console.groq.com/keys
- [ ] Google AI Studio account → free Gemini API key
- [ ] Daytona account (free tier) — used automatically by TrueForge's sandbox, verify free tier limits are enough (a handful of short sandbox runs/day)
- [ ] Qodo installed on the repo (free for open-source projects) — do this before the first commit
- [ ] (Optional, SF in-person only) OpenAI key with the $50 hackathon credit

Environment variables to have ready:
```
GROQ_API_KEY=
GEMINI_API_KEY=
```

---

## PHASE 1 — Harness bootstrap + repo skeleton + Qodo
**Goal:** TrueForge running locally, repo initialized, Qodo watching from commit one.

**Tasks:**
1. `npx @truefoundry/trueforge` — confirm it boots locally on SQLite.
2. Create repo structure:
   ```
   /root-cause
     /victim-app        ← the toy service that breaks
     /mcp-servers
       /metrics
       /deploys
       /rollback
     /sandbox-scripts
       bisect.py
     /ui                ← ops room frontend (Phase 7)
     README.md
     .env.example
   ```
3. Install Qodo on the repo. Confirm it comments on a test PR before moving on.
4. Configure TrueForge's model catalog with Groq as primary provider (OpenAI-compatible endpoint) and Gemini as a secondary/fallback provider.
5. Open PR #1: "Repo skeleton + harness config." Let Qodo review it. Merge.

**Definition of done:** Harness runs locally, chat UI reachable, first PR merged with a visible Qodo review comment thread.

---

## PHASE 2 — The victim app + metrics MCP
**Goal:** Something real to break, and a real (not mocked) MCP tool to read its health.

**Tasks:**
1. Build a minimal Express or Flask app: one `/checkout` endpoint.
2. Seed **5 sequential "deploys"** as git tags/commits on this app. Deploy #3 (or wherever) introduces a bug — e.g., doubles a timeout value or breaks a retry, causing elevated error rates.
3. Each deploy's simulated traffic writes a metrics snapshot (error rate, p95 latency, timestamp) to a simple JSON file or SQLite table — this is your "observability data," no need for real Prometheus/Grafana.
4. Build the **metrics MCP server**. Minimal surface:
   ```
   get_error_rate(service: str, time_range: str) -> { rate: float, timestamp: str }
   get_latency(service: str, time_range: str) -> { p95_ms: float, timestamp: str }
   ```
   ~40-60 lines. Wraps reads from the JSON/SQLite metrics store.
5. Wire the metrics MCP into TrueForge's config. Manually test: ask the agent "what's the current error rate for checkout?" and confirm it calls the real tool.
6. Open PR #2. Qodo review. Merge.

**Definition of done:** Agent can query real (if toy) metrics through a real MCP call — verifiable in TrueForge's tool-call log.

**MVP cut:** if time-pressed, skip the separate latency endpoint — error rate alone is enough to drive the story.

---

## PHASE 3 — Deploys MCP + rollback MCP
**Goal:** The agent can see deploy history and — eventually, with approval — act on it.

**Tasks:**
1. Build the **deploys MCP server**:
   ```
   list_recent_deploys(service: str) -> [{ id: str, timestamp: str, summary: str }]
   get_deploy_diff(deploy_id: str) -> { diff_text: str }
   ```
   Reads from your seeded git tags/commits in `/victim-app`.
2. Build the **rollback MCP server** — this is your one irreversible action:
   ```
   rollback_to(deploy_id: str) -> { success: bool, new_active_deploy: str }
   ```
   Implementation can just flip which deploy's metrics snapshot is "active" — the mechanics don't need to be a real deployment system, they need to be a real, callable, state-changing tool.
3. **Do not** give the agent unrestricted access to `rollback_to` yet — this gets gated in Phase 6.
4. Open PR #3. Qodo review. Merge.

**Definition of done:** Three real MCP servers exist and are independently testable via direct calls, outside the agent.

---

## PHASE 4 — Agent wiring + prompt design
**Goal:** A single coherent agent persona that knows its job and its tools.

**Tasks:**
1. Write the system prompt: role = incident commander, tools = the three MCP servers + sandbox, hard rule = never call `rollback_to` without explicit human confirmation in this session.
2. Test the full read-only path end to end: "investigate the checkout error spike" → agent calls metrics MCP → calls deploys MCP → summarizes findings in plain language.
3. (If time allows) Add a second subagent pass: one subagent pulls metrics, another pulls deploy history, in parallel, merged by the main agent. This is the "work handed to subagents" checkbox for the Double-O track — not required for eligibility, valuable for that track specifically.
4. Open PR #4. Qodo review. Merge.

**Definition of done:** Agent reliably investigates and produces a coherent, evidence-backed summary without yet taking action.

**MVP cut:** single agent, no subagent fan-out. Still fully eligible, just less impressive for the harness-specific track.

---

## PHASE 5 — Sandbox bisection
**Goal:** The centerpiece — the agent runs real code in the sandbox to find the culprit deploy, rather than just guessing from text.

**Tasks:**
1. Write `bisect.py`: takes the deploy list + metrics snapshots, walks through them in order, flags the first deploy where error rate crosses a threshold.
2. Confirm this script is invoked as a sandbox tool call (via Daytona through TrueForge), not run as plain LLM reasoning — this distinction matters for judging.
3. Wire it into the agent's flow: after gathering evidence (Phase 4), the agent runs the bisection script and reports the flagged deploy with the actual script output as evidence.
4. Open PR #5. Qodo review. Merge.

**Definition of done:** You can see, in TrueForge's session log, a sandbox execution event with real stdout showing which deploy was flagged and why.

**MVP cut:** bisection logic can be a simple threshold check rather than a true bisect algorithm — the requirement is "code ran in sandbox to reach a verifiable answer," not algorithmic sophistication.

---

## PHASE 6 — The approval gate + session persistence
**Goal:** The safety story. This is the single most important phase for the "control and safety" judging criterion — do not rush or cut this.

**Tasks:**
1. Implement the hard stop: once the agent has identified the culprit deploy and decides to recommend a rollback, it must present its reasoning and explicitly wait for a human "approve" signal before calling `rollback_to`.
2. Confirm the agent literally cannot call `rollback_to` without that signal — test by trying to get it to skip the step.
3. Test session persistence: start an investigation, close the client, reopen it minutes later, confirm the session resumes at the same point rather than restarting.
4. Open PR #6. Qodo review. Merge.

**Definition of done:** A recorded run where the agent stops, waits, and only proceeds after explicit approval — and a recorded run where a reconnect mid-investigation doesn't lose state.

**MVP cut:** if session persistence is unreliable, keep it out of the demo narrative — it's a bonus, not a requirement. The approval gate itself is non-negotiable.

---

## PHASE 7 — The "ops room" UI
**Goal:** Best UI track. A stranger should be able to look at this screen and understand what's happening without reading logs.

**Tasks:**
1. Single-page layout, three zones:
   - **Left:** live timeline of agent actions (tool calls, sandbox runs) as they happen
   - **Center:** current investigation state — error rate over time, culprit deploy highlighted once found
   - **Right/modal:** the approval gate — unmissable, states exactly what will happen and why, before the action fires
2. Build this against TrueForge's HTTP API / embeddable UI SDK rather than screen-recording the raw chat UI.
3. Open PR #7. Qodo review. Merge.

**Definition of done:** The entire demo can be filmed from this one screen.

**MVP cut:** a clean CLI/terminal output with clear formatting is acceptable if UI time runs out — you lose points on this specific track but stay eligible everywhere else.

---

## PHASE 8 — README, demo, blog post, polish
**Goal:** Ship it like real software.

**Tasks:**
1. README a stranger can follow: setup steps, env vars needed, how to trigger a demo incident, architecture diagram (reuse section 2 above).
2. Record ~3 minute demo: trigger alert → investigation → bisection → approval gate moment (the money shot) → approve → recovery.
3. Double-check no API keys or personal data are committed or visible in the video.
4. (Optional, for the blog post track) Write up the build: what TrueForge handled for you, what broke, what surprised you.
5. Final PR: polish + docs. Qodo review. Merge.

**Definition of done:** Public repo, working README, demo video, submission form filled out.

---

## 4. Full MCP server reference (for Claude Code to implement directly)

### metrics MCP
```
get_error_rate(service: str, time_range: str) -> { rate: float, timestamp: str }
get_latency(service: str, time_range: str) -> { p95_ms: float, timestamp: str }   [optional]
```

### deploys MCP
```
list_recent_deploys(service: str) -> [{ id: str, timestamp: str, summary: str }]
get_deploy_diff(deploy_id: str) -> { diff_text: str }
```

### rollback MCP (the gated one)
```
rollback_to(deploy_id: str) -> { success: bool, new_active_deploy: str }
```

All three are custom, self-hosted, and trivial to implement (~40-60 lines each) — no third-party API needed, no cost.

---

## 5. Model providers (both free-tier)

| Provider | Role | Why |
|---|---|---|
| **Groq** | Primary | OpenAI-compatible endpoint, very fast — matters for a live demo feeling snappy. Not a named default in TrueForge's catalog, so add it as a custom OpenAI-compatible provider pointing at Groq's API base + key. Double check current model names before building (Groq has deprecated some Llama models in favor of GPT-OSS variants). |
| **Gemini** | Secondary / fallback | Natively supported in TrueForge's model catalog. Good for showing vendor-neutrality if a judge asks about it. |

Sandbox: **Daytona free tier**, used automatically by TrueForge — verify current free-tier run limits before the week starts.

---

## 6. Absolute minimum viable submission (if the week goes sideways)

If you're behind schedule, this is the floor that still qualifies for every criterion:

- TrueForge running locally ✅ (Phase 1)
- One real MCP tool (metrics only) ✅ (Phase 2)
- One sandbox code execution (simple threshold check, not full bisect) ✅ (Phase 5, MVP cut)
- One gated irreversible action (rollback) ✅ (Phase 6 — do not cut this one)
- Qodo-reviewed PR history from commit one ✅ (all phases)
- Public repo + README ✅ (Phase 8)
- 3-minute demo ✅ (Phase 8)

Cuttable without losing eligibility: subagent fan-out (Phase 4 bonus), deploy diffs via real diffing (Phase 3, can be a flat summary string instead), the custom ops-room UI (Phase 7, CLI output is acceptable), session persistence as a demo beat (Phase 6 bonus).

**Never cut:** the approval gate. It is the single criterion ("control and safety") that is hardest to fake convincingly on the fly, and the easiest to nail if built deliberately from the start.
