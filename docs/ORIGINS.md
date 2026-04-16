# Origins and Lineage

oh-my-droid is part of the "oh-my-*" family of multi-agent orchestration tools.

## Lineage

```
oh-my-codex (OMX)          oh-my-claudecode (OMC)
     │                            │
     │  OpenAI Codex CLI          │  Claude Code
     │                            │
     └──────────┬─────────────────┘
                │
                ▼
         oh-my-droid (OMD)
              │
              │  Factory Droid
              │
              ▼
        You are here
```

### oh-my-codex (OMX)
- **Author**: Yeachan-Heo
- **Platform**: OpenAI Codex CLI
- **Repository**: https://github.com/Yeachan-Heo/oh-my-codex

### oh-my-claudecode (OMC)
- **Author**: Yeachan-Heo
- **Platform**: Claude Code (Anthropic)
- **Repository**: https://github.com/Yeachan-Heo/oh-my-claudecode

### oh-my-droid (OMD)
- **Original Author**: MeroZemory (Jio)
- **Platform**: Factory Droid
- **Repository**: https://github.com/MeroZemory/oh-my-droid

## Canonical Workflow

The recommended workflow across all oh-my-* tools:

```
deep-interview → ralplan → team/ralph
```

1. **deep-interview**: Socratic clarification of vague requirements (6-dimension ambiguity scoring)
2. **ralplan**: Iterative consensus planning with Planner → Architect → Critic agents
3. **team/ralph**: Parallel or persistent execution

## Key Concepts

### Ralplan (Consensus Planning)

In OMX/OMC, `$ralplan` is an alias for `$plan --consensus`. The workflow uses RALPLAN-DR structured deliberation:

- **Planner**: Creates initial implementation plan
- **Architect**: Reviews for technical feasibility, provides steelman antithesis
- **Critic**: Adversarial review, scores against quality criteria
- **Loop**: Max 5 iterations until Critic approves (score ≥75/100)

**Why it matters**: Prevents "first plan = final plan" trap where edge cases and architectural issues only surface during implementation.

### Ralph (Persistence Mode)

"The boulder never stops rolling" — Ralph keeps working until the task is verified complete by Architect. Includes Ultrawork's parallel execution automatically.

### Team (Coordinated Agents)

N workers on a shared task list. In OMD, this uses tmux for parallel worker coordination.

## Differences from OMC

See [DIFF_OH_MY_CLAUDECODE.md](./DIFF_OH_MY_CLAUDECODE.md) for detailed technical differences.

Key adaptations for Factory Droid:
- Hooks use `.mjs` scripts (Factory's extension system)
- tmux-based parallel worker coordination
- Droids replace Agents (Factory terminology)
- Plugin marketplace distribution

## Credits

- **Yeachan-Heo**: Original oh-my-codex and oh-my-claudecode
- **MeroZemory (Jio)**: oh-my-droid port to Factory Droid
- **Contributors**: See GitHub contributors list
