---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work.

Add an entry for the ticket at the top of `src/app/updates/updates.ts` (the site's 업데이트 page): a short title and what users can now do, in Korean, in the user's domain language.

Commit your work to the current branch.
