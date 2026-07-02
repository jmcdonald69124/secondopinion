---
name: decision-review
description: Judge whether an AI-written or agent-written change was the RIGHT decision, not just whether the code is correct. Use this whenever someone asks to review the approach, the soundness, the business logic, the maintainability, the operational cost, or "was this the right path" for a change produced by a coding agent, an AI, or a pull request, even if they never say "second opinion". Also use before approving or merging agent-generated code.
---

# Decision review

When someone asks whether a change was the right call (as opposed to whether it compiles or passes tests), run a full decision review rather than a line-by-line code review.

Collect the decision trajectory first: the diff, the intent it was meant to satisfy, any plan or reasoning the agent left behind, how it got here (commit order, reverted attempts, the existing patterns it should have followed), and note anything you could not find.

Then dispatch the `decision-reviewer` subagent (via the Task tool) with that evidence, and return its decision review and machine-readable verdict. For an explicit, argument-driven entry point, `/second-opinion:interrogate` does the same thing.

Do not quietly substitute a correctness review. If you only have the diff and none of the reasoning, say so, and lower the confidence to match.
