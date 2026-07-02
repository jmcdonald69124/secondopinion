# second-opinion

A Claude Code plugin that reviews the **decision** behind a change, not its correctness.

Linters, type checkers, tests, and the AI reviewers shipping today already cover whether code runs and whether it has obvious bugs. None of them answer the question a good human reviewer actually answers: was this the right thing to build, built the right way, and what will it cost to own? `second-opinion` answers that one. It reconstructs how a coding agent arrived at a change and interrogates the reasoning, the business logic, the maintainability, the operational cost, and the complexity, then reports out for a human, or hands an approving agent a machine-readable verdict to gate on.

## What it inspects

- **Right path** — should this exist, in this form, or was there a simpler way, or no change at all?
- **Business-logic soundness** — does the code encode the actual business rules and their edge cases, not just the language's?
- **Reasoning soundness** — the trajectory: where the load-bearing decisions were, which were justified and which were guessed, and what got assumed without checking.
- **Future maintainability** — will the next person understand and own it, and does it fit the patterns already here?
- **Operational pain** — how it fails, rollback and migration risk, cost and blast radius at scale.
- **Complexity** — is it as simple as it can be and still do the job?

It deliberately does **not** re-review syntax, style, lint, or test coverage. Those are someone else's job.

## Install

```
/plugin marketplace add jmcdonald69124/secondopinion
/plugin install second-opinion@second-opinion
```

To try it before publishing, clone the repo and load it directly:

```
git clone https://github.com/jmcdonald69124/secondopinion.git
claude --plugin-dir ./secondopinion
```

## Use it

**As a command**, pointed at a PR, a commit range, or the current diff:

```
/second-opinion:interrogate main..HEAD
```

**Conversationally** — just ask. "Was this the right approach?" or "review the reasoning on this change before I merge it" will reach the same reviewer.

**Headless, in CI**, so an agent or a pipeline can gate on the result:

```
claude -p "/second-opinion:interrogate origin/main..HEAD"
```

## What you get back

Two things: a decision review written for a person (what the change is trying to do, the decisions that were made including the implicit ones, findings by dimension, what the reviewer could not see, and the risks you accept by approving), and a machine-readable verdict block for an approving agent:

```json
{
  "tool": "second-opinion",
  "verdict": "approve | revise | block",
  "confidence": "low | medium | high",
  "evidence_seen": ["diff", "intent", "agent_reasoning", "history", "patterns"],
  "evidence_missing": ["..."],
  "findings": [ { "dimension": "right_path", "severity": "high", "summary": "...", "decision_surfaced": "...", "recommendation": "..." } ],
  "accepted_risks_if_approved": ["..."]
}
```

An approving agent should treat `block`, or any `critical` finding, as a stop. `revise` is a judgment call on your own tolerance for risk.

## A note on honesty

The review is only as good as the evidence it is given. If it can see the agent's plan and the history, it can judge the reasoning. If all it has is the diff, it says so and lowers its confidence, rather than pretending to a certainty it hasn't earned. That admission is the point: a reviewer that hides what it couldn't see is a rubber stamp with extra steps.

## How it is built

- `agents/decision-reviewer.md` — the reviewer, run as an isolated subagent so the context that produced the code can't talk it into approving.
- `skills/interrogate/` — the `/second-opinion:interrogate` command: reconstructs the trajectory, then dispatches the reviewer.
- `skills/decision-review/` — the conversational entry point, for when someone asks for a review without the command.

## Contributing

The rubric lives in `agents/decision-reviewer.md`. If your team weighs these dimensions differently, fork it and change the questions.

Before you submit anywhere, run the tests (see [`test/`](./test)):

```
npm test        # structural checks: manifests, frontmatter, cross-references, and `claude plugin validate`
test/smoke.sh   # optional: runs the reviewer against a fixture change (needs the claude CLI, auth, and jq)
```

## License

MIT. See [LICENSE](./LICENSE).
