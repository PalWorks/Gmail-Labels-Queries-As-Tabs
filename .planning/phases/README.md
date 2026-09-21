# Phase records

Point-in-time records of how a phase of work was planned and what was decided
at the time. They are a log, not current guidance.

**Do not update these to match the code.** Rewriting them to stay accurate
would destroy the thing that makes them useful: what was known and decided
when the work happened. If a statement here has since stopped being true, the
correction belongs in the live document that owns that subject, and in an ADR
in [DECISIONS.md](../../DECISIONS.md).

Known examples where these records no longer describe the product:

| Said here | Now |
|---|---|
| "This extension makes zero external network requests" (04-03-PLAN.md) | The extension contacts one origin, the feedback relay, and only when the user presses Send. See ADR-012. |
| Links to `*-SUMMARY.md` files | Those summaries were never written. |

For what is true today, start at [CONTEXT_MAP.md](../../CONTEXT_MAP.md).

`test/repoConsistency.test.ts` deliberately exempts this directory from its
documentation checks for the reasons above.
