# Tests

Two layers, because a plugin like this has two kinds of thing to test.

## Structural — `test/validate.mjs`

Deterministic, dependency-free, free to run, and safe for CI. It runs
`claude plugin validate` and adds the cross-reference checks that schema
validation alone does not: every agent and skill carries the frontmatter Claude
Code needs to register it, the manifests parse and have the required fields, and
the files the README points at actually exist.

```
npm test
# or:
node test/validate.mjs
```

## Behavioral — `test/smoke.sh`

The real "does it work": it runs the actual reviewer against a deliberately
questionable change (an unbounded in-memory cache) and asserts the plugin
produces a usable, parseable verdict.

It is **not** a normal unit test and is not part of `npm test`. The model's
prose is non-deterministic, so it asserts only on the machine-readable contract —
a fenced `json` block with `tool: "second-opinion"` and a verdict of
`approve | revise | block` — never on the wording of the judgment. It needs the
`claude` CLI, authentication, and `jq`, and it spends tokens.

```
test/smoke.sh
```
