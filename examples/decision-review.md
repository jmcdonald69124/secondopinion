# Example: a decision review

This is a real, unedited run of the reviewer — the same output a user sees in
their terminal. It is the change the behavioral test in [`test/smoke.sh`](../test/smoke.sh)
exercises: a baseline `getUser` that hit the database, then a commit that added a
process-local cache with the message *"cache users in memory to cut db load."*

```js
// before
export function getUser(db, id) {
  return db.query("select * from users where id = ?", id);
}

// after
const cache = {}; // grows forever, never invalidated, per-process
export function getUser(db, id) {
  if (cache[id]) return cache[id];
  const row = db.query("select * from users where id = ?", id);
  cache[id] = row;
  return row;
}
```

Reproduce it:

```
/second-opinion:interrogate main~1..HEAD
```

> **Output is non-deterministic.** The verdict is a model's judgment, so the
> wording — and sometimes the `revise`/`block` call itself — varies between runs.
> This capture happened to land on `revise`; an earlier run of the same change
> returned `block`. The tests assert only on the machine-readable contract
> (a valid verdict block), never on the prose.

---

Here is the decision review for `main~1..HEAD`.

---

# Decision Review: In-memory user cache in `store.js`

**Verdict:** revise · **Confidence:** medium

## What this is trying to do
Reduce database load by memoizing `getUser` results in a process-local object keyed by user id. The mechanism does cut repeat queries for the same id, so it serves the literal intent. The question is whether an unbounded, never-invalidated cache is the right way to do that for *user* records specifically.

## The decisions that were made
The author made four load-bearing choices, only the first of which the intent actually mentions:

1. **Cache reads.** Fine and on-intent.
2. **Never invalidate or expire entries.** Nothing writes through or busts the cache. Once a user is read, that snapshot is served for the life of the process. For a `users` table — where email, name, roles, and permissions change — this means the app serves stale identity/authorization data indefinitely. This is the decision with the most business-logic risk, and nothing in the intent says staleness is acceptable.
3. **Let the cache grow forever.** Keyed by id with no bound and no eviction, memory scales with the number of distinct users ever requested. In a long-lived process this is a slow leak that ends in OOM. The author's own comment flags this ("grows forever") without resolving it — a known landmine shipped as-is.
4. **Accept per-process incoherence.** In any multi-process/multi-instance deployment (the default for most web runtimes), each process holds its own divergent view. A user update reflects in one worker and not another, producing nondeterministic reads depending on which process serves the request.

There is also a smaller, silent choice: `if (cache[id])` is a truthiness check, so a missing user (falsy/`null` row) is never cached and re-queries every call. That happens to be safe here (no negative-cache poisoning), but it's incidental rather than reasoned — the cache quietly does not protect the "user not found" path, which is often the hot path under enumeration or bad input.

## Findings

**business_logic — high — permanent staleness of mutable records.** `store.js:5`. There is no write-through, TTL, or invalidation, so updated user rows are never re-read. Serving stale roles/permissions from an auth-adjacent table is a correctness problem, not a tuning knob. Sounder alternative: a cache with a short TTL, or explicit invalidation on the write path if one exists. If the underlying rows are genuinely immutable, that fact needs to be stated in a comment — right now it's an unverified assumption.

**operational — high — unbounded memory growth.** `store.js:1`. No max size, no eviction. Blast radius is the whole process; failure mode is a silent memory climb and eventual OOM crash, i.e. a 2am page. Sounder alternative: an LRU with a bounded size (a small dependency, or a trivial Map-based cap). The inline comment acknowledges this without fixing it.

**operational — medium — multi-process incoherence.** `store.js:1`. Per-process cache yields inconsistent reads across instances. If the deployment is single-process this is moot; if not, a shared cache (Redis/memcached) is the real answer. This is the piece most gated by the deployment-topology evidence that wasn't available.

**right_path — low — mechanism vs. proven need.** No load figures justify caching at all yet. If DB load is not actually a problem, the simplest correct thing is to delete this and keep the baseline query. If it is, the fix above (bounded + TTL, or shared cache) is the right shape. Caching is a plausible path; it's just underspecified.

## What could not be seen
No intent beyond the commit message; no requirements, no read/write ratio or user-row mutation frequency, no load data proving caching is warranted, and no deployment topology (single vs. multi-process). The staleness and incoherence findings hinge on user rows being mutable and the runtime being multi-process — both are strong defaults for this domain but unconfirmed. No recorded agent reasoning, so the trajectory is inferred from two commits. This caps confidence at medium.

## If you approve this, you are accepting
- Users may see stale name/email/role/permission data until the process restarts, with no way to force a refresh short of a redeploy.
- Memory grows with distinct users requested; a long-running or high-cardinality process will eventually OOM with no early warning.
- In a multi-instance deployment, reads are nondeterministic across workers after any write.
- A cache with no proven load justification — you may be owning all of the above to solve a problem you haven't measured.

**Minimum to move this to approve:** bound the cache (size or TTL) and either establish that user rows are immutable (document it) or add invalidation. Confirm the deployment is single-process, or move to a shared cache.

---

```json
{
  "tool": "second-opinion",
  "verdict": "revise",
  "confidence": "medium",
  "evidence_seen": ["diff", "intent", "history", "patterns"],
  "evidence_missing": ["agent_reasoning", "load_figures", "user_row_mutation_frequency", "deployment_topology", "ttl_or_eviction_requirements"],
  "findings": [
    {
      "dimension": "business_logic",
      "severity": "high",
      "summary": "Cache is never invalidated, so mutable user records go permanently stale for the process lifetime.",
      "decision_surfaced": "No write-through, TTL, or invalidation on an auth-adjacent mutable table.",
      "recommendation": "Add a short TTL or explicit invalidation on writes; if rows are truly immutable, document that assumption."
    },
    {
      "dimension": "operational",
      "severity": "high",
      "summary": "Unbounded cache grows forever with distinct user ids; silent memory leak ending in OOM.",
      "decision_surfaced": "Plain object cache with no size cap or eviction (author's own comment flags it).",
      "recommendation": "Use a bounded LRU or size/TTL cap so memory is predictable."
    },
    {
      "dimension": "operational",
      "severity": "medium",
      "summary": "Per-process cache produces incoherent reads across instances after writes.",
      "decision_surfaced": "Cache is process-local rather than shared.",
      "recommendation": "Confirm single-process deployment, or move to a shared cache (Redis/memcached)."
    },
    {
      "dimension": "right_path",
      "severity": "low",
      "summary": "No load data proves caching is needed; may be solving an unmeasured problem.",
      "decision_surfaced": "Introducing a cache layer on intent alone with no metrics.",
      "recommendation": "Verify DB load is actually a problem before owning cache complexity; otherwise keep the baseline query."
    },
    {
      "dimension": "business_logic",
      "severity": "info",
      "summary": "Truthiness check means missing users are never cached; safe here but incidental, leaves the not-found path uncached.",
      "decision_surfaced": "if (cache[id]) skips falsy rows rather than a has-key check.",
      "recommendation": "Decide negative-caching behavior deliberately if the not-found path is hot."
    }
  ],
  "accepted_risks_if_approved": [
    "Stale user identity/authorization data served until process restart",
    "Unbounded memory growth leading to eventual OOM with no warning",
    "Nondeterministic reads across processes in multi-instance deployments",
    "Cache complexity owned without measured evidence of DB load"
  ]
}
```

The headline: caching reads is fine, but this ships three known problems — permanent staleness on a mutable auth-adjacent table, unbounded memory growth (which the author's own comment admits), and multi-process incoherence — none of which the "cut db load" intent asked you to accept. Want me to sketch the bounded-TTL revision?
