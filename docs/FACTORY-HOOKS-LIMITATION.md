# Factory Hooks Limitation: Why Vanilla Mode Failed

## TL;DR

**Factory CLI does not support conditional hook execution.** Hooks always run and their output is always displayed, even when they exit silently early. This makes a true "vanilla droid" experience impossible.

## What We Tried

We attempted to implement "vanilla mode" where:
- `droid` runs without OMD orchestration (hooks disabled)
- `omd` wrapper enables full orchestration via `OMD_ENABLED=1`
- Emergency override via `DISABLE_OMD=1`

### Implementation Approach

1. **Environment variable guard** in `bridge.ts`:
   ```typescript
   if (process.env.DISABLE_OMD === '1') {
     return { continue: true };  // Early exit, no processing
   }
   ```

2. **Wrapper script** (`~/.local/bin/omd`):
   ```bash
   #!/bin/sh
   export OMD_ENABLED=1
   exec droid "$@"
   ```

### Why It Failed

The hooks technically "work" — they exit early and don't process anything. But **Factory CLI still displays hook execution in the terminal**:

```
[hook] session-start.mjs ... exit
[hook] keyword-detector.mjs ... exit
[hook] skill-injector.mjs ... exit
...
```

This visual pollution defeats the purpose of "vanilla mode". Users see hooks launching and exiting on every interaction, which is worse UX than just having OMD active.

## The Root Cause

Factory's hook system is designed for **extension**, not **conditional execution**. There's no mechanism to:
- Suppress hook output when they exit early
- Conditionally skip hooks based on environment
- Run hooks silently in the background

## Current Workaround

To run Factory Droid without OMD:
```bash
droid plugins disable oh-my-droid
```

To re-enable:
```bash
droid plugins enable oh-my-droid
```

## Feature Request

We've filed [Factory issue #936](https://github.com/Factory-AI/factory/issues/936) requesting:
- `--no-hooks` CLI flag
- Or silent hook execution when returning early
- Or conditional hook registration

## Lessons Learned

1. **Test UX, not just functionality**: The guard code worked perfectly, but the user experience was broken.
2. **Platform limitations matter**: Some features require platform support that doesn't exist yet.
3. **Know when to abandon**: After multiple attempts (guard in bridge.ts, guard in each .mjs script, silent exit variations), we accepted the limitation and documented it.

## Removed Code

The following was removed in the cleanup:
- `DISABLE_OMD` / `OMD_ENABLED` checks in `bridge.ts`
- `bridge-disable-omd.test.ts` (tests for removed feature)
- `omd` wrapper installation in `plugin-setup.mjs`
- Various work documents (`REPLY_TO_JIO.md`, etc.)

The benchmark suite still uses "vanilla" terminology to refer to "Factory Droid without OMD" — this is unrelated to the hook guard system.
