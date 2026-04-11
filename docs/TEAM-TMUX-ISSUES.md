# Team Skill - tmux Issues & Fixes

## Problem: Small pane size prevents command execution

When creating tmux sessions programmatically, the default pane size can be too small for long commands like `droid exec ...`. The command gets truncated or doesn't execute properly.

### Symptoms
- Commands sent via `tmux send-keys` appear truncated
- Workers exit immediately with code 0 without doing work
- `tmux attach` shows partial commands

### Root Cause
tmux inherits terminal size from the creating process. When created from a non-interactive shell (like droid), panes can be tiny (40x12 chars).

## Fix 1: Force terminal size on session creation

```bash
# Create session with explicit size
tmux new-session -d -s "omd-team-{slug}" -x 200 -y 50 -n "lead"
```

## Fix 2: Use prompt files instead of inline commands

Instead of:
```bash
tmux send-keys -t "pane" "droid exec 'very long prompt...'" Enter
```

Use:
```bash
# Write prompt to file first (already in skill spec)
# Then reference the file
tmux send-keys -t "pane" "droid exec -f .omd/team/{slug}/workers/worker-1-prompt.md" Enter
```

## Fix 3: Fallback to background processes (nohup)

If tmux visual monitoring isn't critical, use nohup:

```bash
nohup droid exec --auto medium -f worker-prompt.md > worker.log 2>&1 &
echo "PID: $!"
```

Monitor with:
```bash
tail -f .omd/team/{slug}/workers/worker-*.log
```

## Recommended Implementation for SKILL.md

```bash
# 1. Create session with explicit size (CRITICAL)
tmux new-session -d -s "omd-team-{slug}" -x 200 -y 50 -n "lead"

# 2. Set aggressive pane sizing
tmux set-option -t "omd-team-{slug}" aggressive-resize on

# 3. Create panes with explicit sizes
tmux split-window -t "omd-team-{slug}" -h -l 100
tmux split-window -t "omd-team-{slug}:0.1" -v -l 25

# 4. Send commands using file references (not inline prompts)
tmux send-keys -t "omd-team-{slug}:0.1" "droid exec --auto medium -f .omd/team/{slug}/workers/worker-1-prompt.md" Enter
```

## Testing tmux session

```bash
# Check pane sizes
tmux list-panes -t omd-team-{slug} -F "#{pane_index}: #{pane_width}x#{pane_height}"

# Should show reasonable sizes like:
# 0: 100x25
# 1: 100x25
# 2: 99x24
```

## TODO for skill implementation

1. [ ] Update SKILL.md to use `-x 200 -y 50` on session creation
2. [ ] Add fallback to nohup mode if tmux attach fails
3. [ ] Add `--no-tmux` flag for headless/CI environments
4. [ ] Document log file monitoring as alternative to tmux attach
