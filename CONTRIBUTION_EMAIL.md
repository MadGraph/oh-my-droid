# Email à MeroZemory

**To:** merozemory@gmail.com  
**Subject:** Contributing to oh-my-droid: deep-interview & ai-slop-cleaner skills

---

Hi Jio,

I discovered your oh-my-droid project while planning to create my own Factory Droid adaptation of oh-my-codex. After analyzing your repo, I realized you've already done excellent work — the v3.8.17 release is solid, with proper security fixes, smart model routing, and comprehensive skill coverage.

Rather than duplicating effort with a competing project, I'd like to contribute to yours.

## What I'm Working On

I've forked your repo and started a PR branch (`feature/deep-interview-and-slop-cleaner`) with two new skills that are missing from the current OMC-to-OMD port:

### 1. `deep-interview` skill
A Socratic clarification workflow inspired by the original OMX deep-interview, featuring:
- **6-dimension ambiguity scoring** (Scope, Technical, Success, Constraints, Risks, Timeline)
- **Challenge modes** (Devil's Advocate, Scope Creep Detector, Hidden Dependency Probe, Failure Mode Analysis)
- Structured output format for integration with `/plan` and `/ralplan`

### 2. `ai-slop-cleaner` skill
A code quality tool to detect and clean AI-generated "slop" patterns:
- Comment pollution detection
- Verbose conditional simplification
- Hallucinated API/import flagging
- Auto-fix for safe patterns, manual review for risky ones
- Integration with the ralph/autopilot cleanup phase

## Why These Skills?

The original OMX framework had deep-interview as a core workflow, but your port simplified it into the basic `/plan` skill. The 6-dimension scoring and challenge modes are what make the Socratic interview actually effective at surfacing hidden requirements.

AI slop cleaning is something I consider essential for V1 — as AI-assisted coding becomes standard, cleaning up the characteristic verbosity patterns is increasingly important.

## Questions for You

1. Are you open to these contributions via PR?
2. Any architectural preferences I should follow? (I've matched your existing SKILL.md format)
3. Are you still actively maintaining the project? (Last commit was Feb 2026)

I'm happy to iterate based on your feedback before opening the formal PR.

Cheers,  
Mehdi

GitHub: [@MadGraph](https://github.com/MadGraph)  
Fork: https://github.com/MadGraph/oh-my-droid

---

*P.S. Great work on the security hardening in v3.7.0 — the command whitelist and path traversal prevention are exactly what a plugin like this needs.*
