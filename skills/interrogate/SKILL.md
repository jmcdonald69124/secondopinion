---
name: interrogate
description: Interrogate the decisions behind a change produced by a coding agent. Explicit slash command; run it against a PR, a commit range, or a path.
disable-model-invocation: true
---

# /second-opinion:interrogate

Run a decision review on the change described by "$ARGUMENTS" (a PR reference, a commit range like `main..HEAD`, a file path, or empty to mean the current uncommitted diff).

This is not a correctness review. Linters, tests, and type checkers already cover whether the code runs. Your job is to judge whether this was the right thing to build, in the right way, and what it will cost to live with.

## 1. Reconstruct the trajectory (how it got here)

Gather as much of the decision path as is available. Do not ask the user for what you can find yourself.

- **The change itself:** the diff. Use git (`git diff $ARGUMENTS`, `git show`, `git log -p`) or read the PR.
- **The intent:** the requirement, ticket, spec, or PR description the change was meant to satisfy. Look for a spec file, a linked issue, `PLAN.md`, or acceptance criteria.
- **The agent's reasoning:** any plan, design note, decision log, or todo list the coding agent left behind. Check the PR body, commit messages, and files like `*.plan.md` or `DECISIONS.md`.
- **The context map:** how the agent arrived here. The commit sequence, the order files were touched, approaches that were tried and reverted (`git log`, and `git reflog` if it is available), and the surrounding code the change leans on.
- **The patterns:** how the rest of this codebase already does similar things (`git blame`, neighboring modules, existing abstractions).

Note anything you could not find. Missing evidence lowers confidence and must be stated in the report.

## 2. Dispatch the reviewer

Hand everything you gathered to the `decision-reviewer` subagent (via the Task tool): the diff, the intent, the reasoning or plan, the context map, and the relevant existing patterns. Ask it to return the full decision review and the machine-readable verdict.

Running the review in a separate agent keeps it from being swayed by the context that produced the code in the first place.

## 3. Report

Present the subagent's decision review to the user as written. If this was invoked headlessly by another agent (for example, in CI), also emit the machine-readable verdict block so the caller can gate on the result.
