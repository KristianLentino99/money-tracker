---
description: Review current branch changes with Pi project agents
argument-hint: '[base-branch]'
---

Review the current branch against `${1:-dev}` using the Pi `subagent` tool.

First collect the complete change set, including committed, staged, unstaged, and untracked files. Determine whether backend or frontend files are affected. Then delegate these tasks in parallel with `agentScope: "project"`, passing every reviewer the complete changed-file list:

1. `code-change-reviewer` — review architecture, project conventions, security, error handling, naming, and maintainability. Report `- **file:line** — description`.
2. `slop-investigator` — inspect only the changed files for duplication, unnecessary complexity, dead code, defensive cruft, comment slop, and performance problems. Report its required terse findings format.
3. `linter` — run the repository's prescribed lint and type checks. Report exact failures and whether the checks passed.

If the changed files affect executable application logic, run `test-runner` after the reviewers return, limited to the relevant tests. Do not run tests directly from the parent agent.

Compile one concise report with sections:

- Code quality
- Simplification and slop
- Lint and types
- Tests

Group findings by file, remove duplicate observations, preserve exact file paths and line numbers, and state `Clean` for sections without findings. End with a summary of issue counts and any checks that could not run.
