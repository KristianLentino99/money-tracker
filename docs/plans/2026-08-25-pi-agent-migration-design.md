# Pi Agent Migration

## Goal

Replace the repository's Claude Code project automation with Pi-native project resources while keeping the existing delegation rules, specialist workflows, and safety boundaries.

## Architecture

Pi project agents live in `.pi/agents/` and are invoked through the project-local subagent extension. Skills are copied to `.pi/skills/`, the review command becomes `.pi/prompts/review-all.md`, and `.pi/settings.json` registers the project resources and Codex defaults. The root project instructions are named `AGENTS.md`, which Pi and Codex can both load.

All project agents use `openai-codex/gpt-5.6-luna` with `xhigh` thinking, except `slop-investigator`, which uses `openai-codex/gpt-5.6-sol` with `xhigh`. Agent model assignments are explicit so delegated work does not silently inherit a different provider or model.

## Runtime behavior

`project-runtime.ts` replaces the Claude hooks. It blocks direct reads of locale JSON files, blocks dangerous shell commands, asks for explicit confirmation before `git push`, formats supported files after edits and writes, and reports Knip findings after settled main-agent turns. The old safe-command allowlist is not carried over because Pi does not use Claude's permission-decision protocol.

The review prompt delegates to the migrated project agents through Pi's single, parallel, or chained subagent modes. Project-local agent execution remains subject to Pi project trust. Existing application references to Claude as an MCP client remain unchanged because they are product behavior, not agent configuration.

## Validation

Pi successfully loaded the project extension and delegated a smoke task to the project `scout` agent using `gpt-5.6-luna`. The delegated linter ran the repository lint and typecheck commands; lint completed with warnings, while typecheck reported pre-existing nullability errors in the untracked loan amortization test. Those unrelated working-tree changes remain untouched.
