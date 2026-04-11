---
name: team
description: N coordinated agents on shared task list using tmux-based parallel workers
argument-hint: "[N:agent-type] [ralph] <task description>"
aliases: []
level: 4
---

# Team Skill

Spawn N coordinated agents working on a shared task list using **tmux-based parallel workers** with `droid exec`. Replaces the legacy `/swarm` skill (SQLite-based) with tmux-based worker coordination, enabling true parallel execution with visual monitoring.

Ported from oh-my-claudecode's team skill, adapted for Factory Droid.

## Usage

```
/team N:agent-type "task description"
/team "task description"
/team ralph "task description"
```

### Parameters

- **N** - Number of teammate agents (1-20). Optional; defaults to auto-sizing based on task decomposition.
- **agent-type** - OMD agent to spawn for the `team-exec` stage (e.g., executor, debugger, designer). Optional; defaults to stage-aware routing. See Stage Agent Routing below.
- **task** - High-level task to decompose and distribute among teammates
- **ralph** - Optional modifier. When present, wraps the team pipeline in Ralph's persistence loop (retry on failure, architect verification before completion). See Team + Ralph Composition below.

### Examples

```bash
/team 5:executor "fix all TypeScript errors across the project"
/team 3:debugger "fix build errors in src/"
/team 4:designer "implement responsive layouts for all page components"
/team "refactor the auth module with security review"
/team ralph "build a complete REST API for user management"
```

## Architecture

```
User: "/team 3:executor fix all TypeScript errors"
              |
              v
      [TEAM ORCHESTRATOR (Lead)]
              |
              +-- Create tmux session "omd-team-{slug}"
              |       -> lead runs in pane 0.0
              |
              +-- Analyze & decompose task into subtasks
              |       -> explore/architect produces subtask list
              |
              +-- Create task files in .omd/team/{slug}/tasks/
              |       -> task-1.json, task-2.json, task-3.json
              |
              +-- Spawn N tmux panes (workers via droid exec)
              |       -> Each worker claims tasks from pool
              |
              +-- Monitor loop
              |       <- Read worker status files
              |       -> Reassign failed/stuck tasks
              |
              +-- Completion
                      -> Kill tmux session
                      -> Cleanup state files (preserve handoffs)
```

**Storage layout:**
```
.omd/team/{slug}/
├── state.json           # Team metadata, phase, worker count
├── tasks/
│   ├── task-1.json      # Task definition + status
│   ├── task-2.json
│   └── task-3.json
├── workers/
│   ├── worker-1.json         # Worker status + current task
│   ├── worker-1-prompt.md    # Worker prompt file
│   ├── worker-2.json
│   └── worker-2-prompt.md
├── handoffs/
│   ├── team-plan.md     # Stage transition context
│   ├── team-prd.md
│   ├── team-exec.md
│   └── team-verify.md
└── results/
    ├── task-1.md        # Task completion report
    └── task-2.md
```

## Staged Pipeline (Canonical Team Runtime)

Team execution follows a staged pipeline:

`team-plan -> team-prd -> team-exec -> team-verify -> team-fix (loop)`

### Stage Agent Routing

Each pipeline stage uses **specialized agents** -- not just executors. The lead selects agents based on the stage and task characteristics.

| Stage | Required Agents | Optional Agents | Selection Criteria |
|-------|----------------|-----------------|-------------------|
| **team-plan** | `explore` (haiku), `planner` (opus) | `analyst` (opus), `architect` (opus) | Use `analyst` for unclear requirements. Use `architect` for systems with complex boundaries. |
| **team-prd** | `analyst` (opus) | `critic` (opus) | Use `critic` to challenge scope. |
| **team-exec** | `executor` (sonnet) | `executor` (opus), `debugger` (sonnet), `designer` (sonnet), `writer` (haiku), `test-engineer` (sonnet) | Match agent to subtask type. Use `executor` (model=opus) for complex autonomous work, `designer` for UI, `debugger` for compilation issues, `writer` for docs, `test-engineer` for test creation. |
| **team-verify** | `verifier` (sonnet) | `test-engineer` (sonnet), `security-reviewer` (sonnet), `code-reviewer` (opus) | Always run `verifier`. Add `security-reviewer` for auth/crypto changes. Add `code-reviewer` for >20 files or architectural changes. |
| **team-fix** | `executor` (sonnet) | `debugger` (sonnet), `executor` (opus) | Use `debugger` for type/build errors and regression isolation. Use `executor` (model=opus) for complex multi-file fixes. |

**Model mapping for Factory Droid:**
- `haiku` → `claude-haiku-4-5` or `--model claude-haiku-4-5-20251001`
- `sonnet` → `claude-sonnet-4-6` or `--model claude-sonnet-4-6`
- `opus` → `claude-opus-4-6` or `--model claude-opus-4-6`

**Routing rules:**

1. **The lead picks agents per stage, not the user.** The user's `N:agent-type` parameter only overrides the `team-exec` stage worker type. All other stages use stage-appropriate specialists.
2. **Specialist agents complement executor agents.** Route analysis/review to architect/critic agents and UI work to designer agents.
3. **Cost mode affects model tier.** In downgrade: `opus` agents to `sonnet`, `sonnet` to `haiku` where quality permits. `team-verify` always uses at least `sonnet`.
4. **Risk level escalates review.** Security-sensitive or >20 file changes must include `security-reviewer` + `code-reviewer` (opus) in `team-verify`.

### Stage Entry/Exit Criteria

- **team-plan**
  - Entry: Team invocation is parsed and orchestration starts.
  - Agents: `explore` scans codebase, `planner` creates task graph, optionally `analyst`/`architect` for complex tasks.
  - Exit: decomposition is complete and a runnable task graph is prepared.

- **team-prd**
  - Entry: scope is ambiguous or acceptance criteria are missing.
  - Agents: `analyst` extracts requirements, optionally `critic`.
  - Exit: acceptance criteria and boundaries are explicit.

- **team-exec**
  - Entry: Task files created, workers spawned in tmux panes.
  - Agents: workers spawned as the appropriate specialist type per subtask (see routing table).
  - Exit: execution tasks reach terminal state for the current pass.

- **team-verify**
  - Entry: execution pass finishes.
  - Agents: `verifier` + task-appropriate reviewers (see routing table).
  - Exit (pass): verification gates pass with no required follow-up.
  - Exit (fail): fix tasks are generated and control moves to `team-fix`.

- **team-fix**
  - Entry: verification found defects/regressions/incomplete criteria.
  - Agents: `executor`/`debugger` depending on defect type.
  - Exit: fixes are complete and flow returns to `team-exec` then `team-verify`.

### Verify/Fix Loop and Stop Conditions

Continue `team-exec -> team-verify -> team-fix` until:
1. verification passes and no required fix tasks remain, or
2. work reaches an explicit terminal blocked/failed outcome with evidence.

`team-fix` is bounded by max attempts. If fix attempts exceed the configured limit (default: 3), transition to terminal `failed` (no infinite loop).

## Stage Handoff Convention

When transitioning between stages, important context — decisions made, alternatives rejected, risks identified — lives only in the lead's conversation history. If the lead's context compacts or agents restart, this knowledge is lost.

**Each completing stage MUST produce a handoff document before transitioning.**

The lead writes handoffs to `.omd/team/{slug}/handoffs/<stage-name>.md`.

### Handoff Format

```markdown
## Handoff: <current-stage> → <next-stage>
- **Decided**: [key decisions made in this stage]
- **Rejected**: [alternatives considered and why they were rejected]
- **Risks**: [identified risks for the next stage]
- **Files**: [key files created or modified]
- **Remaining**: [items left for the next stage to handle]
```

### Handoff Rules

1. **Lead reads previous handoff BEFORE spawning next stage's agents.** The handoff content is included in the next stage's agent spawn prompts, ensuring agents start with full context.
2. **Handoffs accumulate.** The verify stage can read all prior handoffs (plan → prd → exec) for full decision history.
3. **On team cancellation, handoffs survive** in `.omd/team/{slug}/handoffs/` for session resume. They are not deleted on cleanup.
4. **Handoffs are lightweight.** 10-20 lines max. They capture decisions and rationale, not full specifications (those live in deliverable files like DESIGN.md).

### Handoff Example

```markdown
## Handoff: team-plan → team-exec
- **Decided**: Microservice architecture with 3 services (auth, api, worker). PostgreSQL for persistence. JWT for auth tokens.
- **Rejected**: Monolith (scaling concerns), MongoDB (team expertise is SQL), session cookies (API-first design).
- **Risks**: Worker service needs Redis for job queue — not yet provisioned. Auth service has no rate limiting in initial design.
- **Files**: DESIGN.md, TEST_STRATEGY.md
- **Remaining**: Database migration scripts, CI/CD pipeline config, Redis provisioning.
```

## Resume and Cancel Semantics

### Resume

Restart from the last non-terminal stage using staged state + live task status:

1. Read `.omd/team/{slug}/state.json` to get current phase
2. Read `.omd/team/{slug}/handoffs/` to recover stage transition context
3. Check task status files to determine progress
4. Resume monitoring or respawn workers as needed

### Cancel

`/cancel` handles team cleanup:

1. Read team state to get `slug` and `linked_ralph` status
2. Send SIGTERM to all worker tmux panes
3. Wait 5 seconds for graceful shutdown
4. Kill tmux session: `tmux kill-session -t omd-team-{slug}`
5. Mark state as `phase: "cancelled"`, `active: false`
6. Preserve handoff files in `.omd/team/{slug}/handoffs/` for potential resume
7. If `linked_ralph` is true, also clear ralph state

**Terminal states:** `complete`, `failed`, `cancelled`

### Linked Mode Cancellation (Team + Ralph)

When team is linked to ralph, cancellation follows dependency order:

- **Cancel triggered from Ralph context:** Cancel Team first (graceful shutdown of all workers), then clear Ralph state.
- **Cancel triggered from Team context:** Clear Team state, mark Ralph as cancelled.
- **Force cancel:** Clears both `team` and `ralph` state unconditionally.

## tmux Integration

### Session Management

```bash
# Create team session
tmux new-session -d -s "omd-team-{slug}" -x 200 -y 50 -n "lead"

# Create worker panes
tmux split-window -t "omd-team-{slug}" -h
tmux split-window -t "omd-team-{slug}" -v
# ... repeat for N workers

# Send commands to workers using droid exec
tmux send-keys -t "omd-team-{slug}:0.1" \
  "droid exec --auto medium --cwd $(pwd) -f .omd/team/{slug}/workers/worker-1-prompt.md" Enter
```

### Worker Pane Layout

For 3 workers:
```
┌─────────────────────────────────────┐
│              LEAD (0.0)             │
├─────────────────┬───────────────────┤
│  WORKER-1 (0.1) │   WORKER-2 (0.2)  │
├─────────────────┴───────────────────┤
│           WORKER-3 (0.3)            │
└─────────────────────────────────────┘
```

### Worker Command

Workers are spawned using `droid exec` (non-interactive mode):

```bash
# Basic worker (read-only analysis)
droid exec "Worker 1: claim and execute tasks..."

# Worker with file editing capability
droid exec --auto medium "Worker 1: claim and execute tasks..."

# Worker that can commit/push
droid exec --auto high "Worker 1: claim, fix, and commit..."

# Worker with specific model (for cost optimization)
droid exec --auto medium --model claude-sonnet-4-6 "Worker 1: ..."
droid exec --auto medium --model claude-haiku-4-5-20251001 "Worker 1: ..."
```

**Autonomy levels for workers:**
- `(none)` - Read-only analysis, planning
- `--auto low` - Safe file operations (create, edit, format)
- `--auto medium` - Development tasks (npm install, git commit local, build)
- `--auto high` - Full operations (git push, deployments)

### Attach to Monitor

```bash
tmux attach -t "omd-team-{slug}"
```

User can watch all workers in real-time!

## Workflow

### Phase 1: Parse Input

- Extract **N** (agent count), validate 1-20
- Extract **agent-type**, validate it maps to a known OMD subagent
- Extract **task** description
- Generate team slug from task (e.g., "fix TypeScript errors" → "fix-ts-errors")

### Phase 2: Initialize Team

1. Create tmux session:
   ```bash
   tmux new-session -d -s "omd-team-{slug}" -x 200 -y 50 -n "lead"
   ```

2. Create state directory:
   ```bash
   mkdir -p .omd/team/{slug}/{tasks,workers,handoffs,results}
   ```

3. Write initial state:
   ```json
   {
     "slug": "fix-ts-errors",
     "task": "fix all TypeScript errors",
     "phase": "team-plan",
     "agentCount": 3,
     "agentType": "executor",
     "startedAt": "2026-04-11T12:00:00Z",
     "linkedRalph": false,
     "active": true
   }
   ```

### Phase 3: Analyze & Decompose (team-plan)

Use explore/architect to analyze codebase and create subtasks:

```
Task(
  subagent_type="worker",
  prompt="Analyze the codebase and decompose this task into N independent subtasks:
  Task: {task}
  
  Output JSON array of subtasks:
  [
    { \"id\": \"task-1\", \"description\": \"...\", \"files\": [\"...\"], \"dependencies\": [] },
    ...
  ]"
)
```

Write each subtask to `.omd/team/{slug}/tasks/task-{n}.json`:
```json
{
  "id": "task-1",
  "description": "Fix type errors in src/auth/",
  "files": ["src/auth/login.ts", "src/auth/session.ts"],
  "dependencies": [],
  "status": "pending",
  "assignedTo": null,
  "claimedAt": null,
  "completedAt": null,
  "result": null,
  "error": null
}
```

**Write handoff:** `.omd/team/{slug}/handoffs/team-plan.md`

### Phase 3.5: PRD (team-prd) - Optional

Entry condition: scope is ambiguous or acceptance criteria are missing.

Use analyst agent to extract requirements:

```
Task(
  subagent_type="worker",
  prompt="Extract clear acceptance criteria and boundaries for this task:
  Task: {task}
  Context from team-plan: {handoff content}
  
  Output:
  - Acceptance criteria (specific, testable)
  - Scope boundaries (what's in, what's out)
  - Dependencies and assumptions"
)
```

**Write handoff:** `.omd/team/{slug}/handoffs/team-prd.md`

### Phase 4: Spawn Workers (team-exec)

Create N tmux panes and start workers using `droid exec`:

```bash
# For each worker 1..N:
tmux split-window -t "omd-team-{slug}"

# Write worker prompt to file
cat > .omd/team/{slug}/workers/worker-{n}-prompt.md << 'EOF'
You are WORKER-{n} in team "{slug}".
Working directory: {cwd}
Team state: .omd/team/{slug}/

== CONTEXT FROM PREVIOUS STAGES ==
{handoff content from team-plan and team-prd}

== WORK PROTOCOL ==

1. CLAIM: Read .omd/team/{slug}/tasks/ to find pending tasks.
   Pick one where status="pending" and dependencies are met.
   Write your worker ID to the task's assignedTo field atomically.

2. WORK: Execute the task using your tools (Read, Edit, Execute).
   Do NOT spawn sub-agents (no Task tool). Work directly.

3. COMPLETE: Update the task file:
   - Set status="done" or status="failed"
   - Set completedAt to current timestamp
   - Write result to .omd/team/{slug}/results/task-{id}.md

4. UPDATE STATUS: Write your status to .omd/team/{slug}/workers/worker-{n}.json:
   {
     "workerId": "worker-{n}",
     "status": "idle" | "working" | "done",
     "currentTask": "task-1" | null,
     "lastHeartbeat": "ISO timestamp",
     "completedTasks": ["task-1", "task-2"]
   }

5. NEXT: Check for more pending tasks. If none, set status="done".

== RULES ==
- NEVER spawn sub-agents (no Task tool)
- ALWAYS use absolute file paths
- UPDATE worker status after each task
- SEND heartbeat every 60 seconds for long tasks
- EXIT when all tasks are done or no pending tasks remain
EOF

# Spawn worker with droid exec
tmux send-keys -t "omd-team-{slug}:0.{n}" \
  "droid exec --auto medium --cwd {cwd} -f .omd/team/{slug}/workers/worker-{n}-prompt.md" Enter
```

**Write handoff:** `.omd/team/{slug}/handoffs/team-exec.md`

### Phase 5: Monitor

Lead monitors progress by:

1. **Polling task files** - Check `.omd/team/{slug}/tasks/*.json` for status changes
2. **Reading worker status** - Check `.omd/team/{slug}/workers/*.json` for heartbeats
3. **Detecting stuck workers** - If no heartbeat for 5 minutes, reassign tasks
4. **Crash recovery** - Respawn dead workers, reassign orphaned tasks

**Progress Display:**
```
[TEAM: fix-ts-errors - PHASE: team-exec]
┌─────────────────────────────────────────────────────────┐
│ Tasks: 2/5 done, 1 in-progress, 2 pending              │
│ Workers: 3 active                                       │
├─────────────────────────────────────────────────────────┤
│ worker-1: [working] task-3 - Fix auth types             │
│ worker-2: [idle] completed task-1, task-2               │
│ worker-3: [working] task-4 - Fix API types              │
└─────────────────────────────────────────────────────────┘

Attach to watch: tmux attach -t omd-team-fix-ts-errors
```

### Phase 6: Verify (team-verify)

When all exec tasks complete:

1. Read all handoffs for full context
2. Spawn verifier agent:
   ```
   Task(
     subagent_type="worker",
     prompt="Verify all changes made by the team:
     - Run typecheck: bun run typecheck (or tsc --noEmit)
     - Run tests: bun run test (or npm test)
     - Run lint: bun run lint
     - Review changes in .omd/team/{slug}/results/
     
     Context from previous stages:
     {all handoff content}
     
     Output: PASS or FAIL with detailed issues list"
   )
   ```

3. If PASS → Phase 7 (Completion)
4. If FAIL → Phase 6.5 (Fix)

**Write handoff:** `.omd/team/{slug}/handoffs/team-verify.md`

### Phase 6.5: Fix (team-fix)

For each issue found:

1. Create fix task in `.omd/team/{slug}/tasks/fix-{n}.json`
2. Respawn workers to claim fix tasks
3. Return to Phase 4 (Exec) then Phase 6 (Verify)

**Max fix loops:** 3 (configurable via `.omd/config.json`)

### Phase 7: Completion

1. Kill tmux session:
   ```bash
   tmux kill-session -t "omd-team-{slug}"
   ```

2. Generate summary report

3. Update state:
   ```json
   {
     "phase": "complete",
     "active": false,
     "completedAt": "ISO timestamp"
   }
   ```

4. Clean up task/worker files (optional, configurable)

5. **Preserve handoffs** in `.omd/team/{slug}/handoffs/` for inspection

6. If linked to Ralph, signal completion

## Team + Ralph Composition

When invoked with `ralph` modifier:

```
/team ralph "build REST API"
```

The execution becomes:
1. Ralph outer loop starts (iteration 1)
2. Team pipeline runs: `team-plan -> team-prd -> team-exec -> team-verify`
3. If `team-verify` passes: Ralph runs architect verification
4. If architect approves: both modes complete
5. If `team-verify` fails OR architect rejects: team enters `team-fix`, then loops
6. If fix loop exceeds `max_fix_loops`: Ralph increments iteration and retries full pipeline
7. If Ralph exceeds `max_iterations`: terminal `failed` state

### State Linkage

Both modes write their own state files with cross-references:

```json
// Team state (.omd/team/{slug}/state.json)
{
  "slug": "build-rest-api",
  "linkedRalph": true,
  "task": "build a complete REST API"
}

// Ralph state (.omd/state/ralph-state.json)
{
  "linkedTeam": true,
  "teamSlug": "build-rest-api",
  "iteration": 1,
  "maxIterations": 10
}
```

## Idempotent Recovery

If the lead crashes mid-run, the team skill should detect existing state and resume:

1. Check `.omd/team/` for existing team directories
2. If found, read `state.json` to discover active teams
3. Resume monitoring instead of creating duplicate team
4. Check task files to determine current progress
5. Respawn dead workers if needed

This prevents duplicate teams and allows graceful recovery from lead failures.

## Comparison: Team vs Swarm

| Feature | Team (tmux) | Swarm (SQLite) |
|---------|-------------|----------------|
| **Parallelism** | True parallel (tmux panes) | Background agents (limited) |
| **Visibility** | Real-time (tmux attach) | Logs only |
| **Coordination** | File-based | SQLite transactions |
| **Max workers** | 20 | 5 |
| **Worker type** | `droid exec` sessions | Task subagents |
| **Crash recovery** | Heartbeat + reassign | Lease timeout |
| **Autonomy control** | `--auto low/medium/high` per worker | None (inherits lead) |
| **Model control** | `--model <id>` per worker | Inherits lead model |
| **Stage pipeline** | Full (plan→prd→exec→verify→fix) | None |
| **Handoffs** | Yes (preserved across stages) | No |
| **Resume** | Yes (state + handoffs) | Limited |

**When to use Team:** Complex tasks needing visual monitoring, many workers, staged pipeline, or long-running execution.

**When to use Swarm:** Simple parallelization, quick tasks, or when tmux is unavailable.

## droid exec Reference

Workers use `droid exec` for non-interactive execution:

```bash
# Syntax
droid exec [options] [prompt]
droid exec [options] -f <prompt-file>
droid exec [options] - < prompt.txt

# Key options
--auto <level>        # low|medium|high - autonomy level
--cwd <path>          # Working directory
--model <id>          # Model to use
-f, --file <path>     # Read prompt from file
--session-id <id>     # Continue existing session
--skip-permissions-unsafe  # Bypass all checks (CI/isolated only)

# Available models
claude-opus-4-6         # Default, best quality
claude-opus-4-5-20251101
claude-sonnet-4-6       # Good balance
claude-sonnet-4-5-20250929
claude-haiku-4-5-20251001  # Fast, cheap
gpt-5.2, gpt-5.4        # OpenAI models
gemini-3.1-pro-preview  # Google models

# Autonomy levels
# (none)      Read-only - analysis, planning, no modifications
# --auto low  Safe file ops - create, edit, format
# --auto medium  Dev tasks - npm install, git commit (local), build
# --auto high  Full ops - git push, deployments, production changes
```

## Configuration

Optional settings in `.omd/config.json`:

```json
{
  "team": {
    "maxWorkers": 20,
    "defaultAgentType": "executor",
    "defaultAutoLevel": "medium",
    "heartbeatTimeoutMs": 300000,
    "maxFixLoops": 3,
    "preserveStateOnComplete": false,
    "preserveHandoffsOnComplete": true
  }
}
```

## Integration with Other Skills

| Skill | Integration |
|-------|-------------|
| `/ralph` | Team can be wrapped in Ralph persistence loop |
| `/deep-interview` | Invoke during team-prd if requirements are unclear |
| `/ai-slop-cleaner` | Run on completed work during team-verify |
| `/ralplan` | Alternative planning approach before team-exec |

## Requirements

- **tmux** must be installed (`brew install tmux` on macOS, `apt install tmux` on Linux)
- Factory Droid CLI (`droid`) must be in PATH
- `droid exec` command available

## Example Session

**User:** `/team 3:executor "fix all TypeScript errors in src/"`

```
[TEAM INITIALIZED]
┌─────────────────────────────────────────────────────────┐
│ Slug: fix-ts-errors                                     │
│ Workers: 3 (executor)                                   │
│ tmux session: omd-team-fix-ts-errors                    │
└─────────────────────────────────────────────────────────┘

[PHASE: team-plan]
Analyzing codebase...
Found 12 files with TypeScript errors.
Decomposed into 5 subtasks:
  - task-1: Fix errors in src/auth/ (3 files)
  - task-2: Fix errors in src/api/ (4 files)
  - task-3: Fix errors in src/utils/ (2 files)
  - task-4: Fix errors in src/types/ (2 files)
  - task-5: Fix errors in src/components/ (1 file)

Writing handoff: .omd/team/fix-ts-errors/handoffs/team-plan.md

[PHASE: team-exec]
Spawning 3 workers in tmux...

Attach to watch: tmux attach -t omd-team-fix-ts-errors

[MONITORING]
┌─────────────────────────────────────────────────────────┐
│ Tasks: 0/5 done, 3 in-progress, 2 pending              │
│ Workers: 3 active                                       │
├─────────────────────────────────────────────────────────┤
│ worker-1: [working] task-1 - Fix auth errors            │
│ worker-2: [working] task-2 - Fix API errors             │
│ worker-3: [working] task-3 - Fix utils errors           │
└─────────────────────────────────────────────────────────┘

... (time passes) ...

Writing handoff: .omd/team/fix-ts-errors/handoffs/team-exec.md

[PHASE: team-verify]
Running verification...
  ✓ bun run typecheck: PASS (0 errors)
  ✓ bun run test: PASS (42/42)
  ✓ bun run lint: PASS

Writing handoff: .omd/team/fix-ts-errors/handoffs/team-verify.md

[COMPLETE]
┌─────────────────────────────────────────────────────────┐
│ Team "fix-ts-errors" completed successfully             │
│ Duration: 4m 32s                                        │
│ Tasks: 5/5 done                                         │
│ Workers used: 3                                         │
│ Fix loops: 0                                            │
└─────────────────────────────────────────────────────────┘

Handoffs preserved at: .omd/team/fix-ts-errors/handoffs/
Cleaned up tmux session.
```

## Gotchas

1. **tmux required** - Skill fails gracefully if tmux not installed
2. **Worker isolation** - Workers should not modify same files concurrently (task decomposition should ensure file-scoped tasks)
3. **Heartbeat important** - Workers must update status regularly for crash detection
4. **File locking** - Use atomic writes for task status updates to prevent race conditions
5. **Cleanup on crash** - If lead crashes, run `/cancel` to clean up orphaned tmux session
6. **Handoffs survive cancel** - Handoff files are preserved for potential resume
7. **Team slug must be valid** - Use lowercase letters, numbers, and hyphens only
8. **Model costs** - Be mindful of model selection for workers; haiku is much cheaper than opus
9. **CLI workers are independent** - Unlike Claude Code native teams, tmux workers don't have inter-agent messaging; coordination is via files only

## Known Issues & Fixes

### tmux pane size causes droid exec to fail silently

**Problem:** When `tmux new-session -d` is called from a non-interactive shell (e.g., from within a droid session), tmux inherits a tiny terminal size (~40x12). Commands sent via `tmux send-keys` get truncated and `droid exec` fails silently.

**Symptoms:**
- Workers exit immediately with code 0 without producing output
- `tmux capture-pane` shows truncated commands
- Results directory stays empty

**Fix:** Always create the session with explicit dimensions:
```bash
# REQUIRED: explicit -x and -y
tmux new-session -d -s "omd-team-{slug}" -x 200 -y 50 -n "lead"

# Enable aggressive resize for when user attaches
tmux set-option -t "omd-team-{slug}" aggressive-resize on
```

**Fallback:** If tmux still fails, use background processes:
```bash
nohup droid exec --auto medium -f worker-prompt.md > worker.log 2>&1 &
# Monitor with: tail -f worker-*.log
```
