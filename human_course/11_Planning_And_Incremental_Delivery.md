# Chapter 11: Planning & Incremental Delivery — Shipping Ambitious Features in Small, Safe Steps

> *"Plans are useless, but planning is indispensable." — Dwight D. Eisenhower*

---

## Why This Chapter Exists

You have learned how to write tests first, how to make the compiler guard your invariants, how to structure code so business logic sits at the center, and how to refactor without fear. All of those skills happen at the level of individual lines, files, and commits.

This chapter zooms out. It answers the question: **how do you ship something big without losing control?**

The answer is deceptively simple: you do not ship something big. You ship a sequence of small things, each of which leaves the codebase in a working state. The discipline is in the decomposition — breaking ambitious work into steps so small that each one is boring, obvious, and safe.

This is not about being cautious or slow. It is about never finding yourself in a state where tests are broken, half-finished code litters the codebase, and you cannot remember what still needs to happen. Engineers who ship fast and reliably are not working in large leaps. They are working in small, rapid, known-good increments.

---

## 1. The Mental Model: Known-Good Increments

Think of your codebase as a building. Every commit is a floor. If every floor is structurally sound, the building stands no matter how tall it gets. If you try to build three floors at once and something goes wrong, you do not know which floor has the problem — and you cannot safely stand on any of them.

**All work must be done in small, known-good increments. Each increment leaves the codebase in a working state where all tests pass.**

This principle has consequences:

- You never have "work in progress" that breaks the build.
- You can stop at any point and the code is shippable.
- When something breaks, the cause is in the most recent small change, not somewhere in a 400-line diff.
- Your teammates can review, understand, and approve your work quickly.

This is not a luxury for teams with time to spare. This is how you go faster. The time you "save" by bundling changes into large chunks is lost tenfold when something goes wrong and you cannot isolate the cause.

---

## 2. What Makes a "Known-Good Increment"

Not every change qualifies. A known-good increment has six properties:

1. **All tests pass.** No exceptions. No "I'll fix that in the next commit." If tests are red, the increment is not done.
2. **It is independently deployable.** The increment does not depend on future work to function. It may be incomplete — a feature behind a flag, an internal function not yet wired to the UI — but the system works.
3. **It has clear done criteria.** Before you start, you know exactly what "done" means for this step. Not "make progress on the search feature." Instead: "return an empty array when the search query is blank."
4. **It fits in a single commit.** If you need two commits, you have two increments. Split them.
5. **It is describable in one sentence.** "Add validation for negative quantities in the order line item." That is one increment. "Add validation, update the error messages, and refactor the order module" is three.
6. **It has been verified by mutation testing.** The tests you wrote actually catch the bugs they claim to prevent.

Here is the litmus test: **if you cannot describe a step in one sentence, break it down further.**

---

## 3. Step Size Heuristics

Getting the step size right is a skill that improves with practice. Here are heuristics to calibrate.

### Signs a Step Is Too Big

- It takes more than one working session to complete.
- It requires multiple commits to feel "done."
- The description contains the word "and" more than once: "add the repository and the service and the route handler."
- You are unsure how you would test it.
- You cannot hold the entire change in your head at once.
- The diff touches more than two or three files for unrelated reasons.

### Signs a Step Is the Right Size

- There is one clear test case (or a small, cohesive group of cases) that proves it works.
- It represents one logical change to the system.
- You can explain it to a colleague in under thirty seconds.
- It is obvious when you are done — there is no ambiguity.
- The commit message writes itself.

### Bad Approach: Kitchen-Sink Steps

```
Step 1: Build the user search feature
  - Add search endpoint
  - Add search service with filtering, sorting, pagination
  - Add input validation
  - Add caching layer
  - Add UI search bar with debounced input
  - Write tests for everything
```

This is not a step. This is a project. When it takes three days and something breaks on day two, you have no safe ground to retreat to.

### Good Approach: Incremental Steps

```
Step 1:  Add Search use case that returns all users when query is empty
Step 2:  Add name-based filtering to Search use case
Step 3:  Add pagination parameters to Search use case
Step 4:  Add sorting parameters to Search use case
Step 5:  Add SearchController route that delegates to the use case
Step 6:  Add input validation to SearchController
Step 7:  Add caching adapter for search results
Step 8:  Add SearchBar component that calls the endpoint
Step 9:  Add debounced input to SearchBar
Step 10: Wire pagination controls to SearchBar
```

Each step is one sentence. Each step has obvious test cases. Each step leaves the system working. If you finish step 6 and get pulled to an urgent bug, the search feature works — it just does not have caching or a UI yet.

---

## 4. The Plan File as a Contract

Plans are not kept in your head. They live in a file so they can be reviewed, discussed, and tracked.

### Where Plans Live

Plans live in a `plans/` directory at the project root. One file per feature. Delete the file when the feature is complete.

### Plan Structure

Every plan follows this structure:

```markdown
# Feature: User Search

## Goal
Allow users to search for other users by name with paginated, sorted results.

## Acceptance Criteria
- [ ] Searching with an empty query returns all users (paginated)
- [ ] Searching by name filters results case-insensitively
- [ ] Results can be sorted by name or join date
- [ ] Results are paginated with configurable page size
- [ ] Search results are cached for 60 seconds
- [ ] The search bar debounces input by 300ms

## Steps

### Step 1: Add Search use case — empty query returns all users
- **RED:** Test that `SearchUsers.execute('')` returns all users
- **GREEN:** Implement minimal `SearchUsers` use case
- **REFACTOR:** Extract user repository port if needed
- **MUTATE:** Verify mutation coverage on the empty-query path

### Step 2: Add name-based filtering to Search use case
- **RED:** Test that `SearchUsers.execute('alice')` returns only matching users
- **GREEN:** Add filtering logic
- **REFACTOR:** —
- **MUTATE:** Verify mutations on the filter predicate are caught

(... remaining steps ...)
```

### Plans Can Change — Explicitly

Reality will diverge from the plan. That is fine. What is not fine is silently changing direction. When a plan needs to change:

1. Update the plan file with the new steps.
2. Note what changed and why.
3. Get approval on the revised plan before continuing.

A plan that silently drifts is not a plan. It is a wish.

### Delete the Plan When Done

A completed plan file is clutter. Once all acceptance criteria are met and the feature is shipped, delete the plan file. It has served its purpose. The git history preserves the record if you ever need it.

---

## 5. Why Small PRs Are a Gift to Your Team

This is not just about your own productivity. Small increments directly improve the experience of everyone who works with you.

### Easier to Review

A 50-line PR takes five minutes to review thoughtfully. A 500-line PR takes an hour — and the quality of the review degrades as the reviewer's attention fades. Small PRs get reviewed faster, reviewed better, and approved sooner.

### Easier to Revert

When a small PR causes a problem in production, reverting it is trivial and safe. When a large PR causes a problem, reverting it may undo unrelated improvements, and the team burns time figuring out which part of the change was the culprit.

### Easier to Reason About

Each small PR has one purpose. The reviewer does not need to hold multiple unrelated concepts in their head simultaneously. They can evaluate the change on its own terms.

**A PR is too big when the reviewer needs to hold multiple unrelated concepts in their head at the same time.**

### Unblocks Parallel Work

When a PR sits in review, small scope means it does not block unrelated work. Your teammates can review it quickly and move on. You can start the next increment on a new branch without creating a tangled dependency chain.

### The Compound Effect

A team that consistently ships small PRs moves faster than a team that ships large ones. Reviews happen in minutes, not days. Merge conflicts are rare and small. Deployments are low-risk. Bugs are caught early and fixed fast. The pace feels sustainable because it is.

---

## 6. The Full Workflow

Here is how all of this fits together from the moment you pick up a feature to the moment it ships.

```
START FEATURE
├── Write plan file in plans/
├── Get plan approved
│
│   FOR EACH STEP IN THE PLAN:
│   │
│   ├── RED:      Write a failing test that describes the behavior
│   ├── GREEN:    Write the minimum code to make it pass
│   ├── REFACTOR: Improve the code if there is clear value
│   ├── MUTATE:   Run mutation testing to verify test quality
│   │
│   ├── Verify: all tests pass
│   ├── Verify: static analysis passes (typecheck + lint)
│   └── STOP: Ask "Ready to commit?" — do not commit without approval
│
END FEATURE
├── Verify all acceptance criteria are met
├── Final mutation testing pass
└── Delete plan file
```

The key discipline is the **STOP** at the end of each step. You do not decide on your own that the work is ready to commit. You pause, present the state of the code, and get explicit approval. This is not bureaucracy — it is a checkpoint that catches mistakes before they enter the history.

---

## 7. Commit Discipline

Commits are permanent. They form the historical record of your project. Treating them casually leads to histories full of "fix typo," "WIP," and "actually fix the thing" — histories that are useless for understanding what happened and why.

### The Rules

1. **Never commit without approval.** After completing a step, verify that tests pass, verify that static analysis passes, then stop and ask: "Ready to commit?"
2. **One step, one commit.** A commit corresponds to exactly one step in the plan. Not half a step. Not two steps bundled together.
3. **Commit messages describe behavior, not activity.** Not "work on search feature." Instead: "return empty array when search query is blank." The message should tell a future reader what changed in the system's behavior.
4. **All checks pass before committing.** Tests, type checking, linting — everything green. No exceptions.

### Why This Matters

When you bisect a bug six months from now, every commit in the history is a known-good state. You can check out any commit and the system works. You can read any commit message and understand what it did. This is the payoff for the discipline.

---

## 8. The Acceptance Criteria Mindset

Acceptance criteria define what "done" means for a feature. They are the contract between you and whoever asked for the work. Getting them right is essential.

### Write Behavior, Not Implementation

Bad acceptance criteria describe how the code should be structured:

```
- [ ] Create a SearchService class
- [ ] Add a /search endpoint
- [ ] Use Redis for caching
```

These are implementation decisions, not business outcomes. They constrain the solution before you understand the problem.

Good acceptance criteria describe observable behavior:

```
- [ ] Searching with a blank query returns all users, paginated
- [ ] Searching by name is case-insensitive
- [ ] Repeated identical searches within 60 seconds return cached results
- [ ] Results include total count for pagination UI
```

These criteria tell you what the system should do without telling you how to build it. They can be verified by a test. They can be demonstrated to a stakeholder. They survive refactoring.

### Every Criterion Gets a Test

If an acceptance criterion cannot be expressed as a test, it is either too vague or it is not a real requirement. Tighten the wording until you can write a test for it. If you still cannot, question whether the criterion belongs in the list.

Tests at every level — unit, integration, end-to-end — should verify behavior. The acceptance criteria are your guide for what those tests should assert.

---

## 9. Pre-PR Quality Gate

Before a PR is opened, the work must pass a quality gate. This is not optional. It is the minimum standard.

### The Checklist

1. **All tests pass.** Run the full suite, not just the tests you think are relevant.
2. **Type checking passes.** `tsc --noEmit` with strict mode. Zero errors.
3. **Linting passes.** No warnings, no suppression comments added during this work.
4. **Mutation testing passes.** Your tests survive mutation analysis. Dead mutants stay dead.
5. **Refactoring assessment.** Look at the code with fresh eyes. Is there duplication that represents duplicated knowledge? Are there names that could be clearer? Is there speculative code that should be removed?
6. **Glossary check (DDD projects).** If the project maintains a ubiquitous language glossary, verify that any new terms are added and existing terms are used consistently.

### Automate What You Can

The first four items should be automated in CI. The last two require human judgment, which is why you pause and assess before declaring the work ready.

---

## 10. Capturing Learnings

Every significant piece of work teaches you something. If you do not capture it, you will learn the same lessons repeatedly — and so will your teammates.

### The Prompt

At the end of every significant change, ask yourself: **"What do I wish I had known at the start?"**

The answer goes into a learnings document — a section in the project wiki, a `LEARNINGS.md` file, or wherever the team keeps institutional knowledge.

### Categories of Learnings

Structure your learnings so they are findable later:

- **Gotchas:** "The Redis client silently drops connections after 30 seconds of inactivity. You must configure a keep-alive interval."
- **Patterns:** "For paginated endpoints, always return the total count alongside the results. Every consumer eventually needs it."
- **Anti-patterns:** "Do not cache search results by query string alone — user permissions mean the same query returns different results for different users."
- **Decisions:** "We chose to denormalize the user display name into the search index because joining at query time added 200ms of latency."
- **Edge cases:** "Empty search queries must still respect pagination parameters. The UI sends page=1&size=20 even when the query is blank."
- **Tool knowledge:** "Vitest's `--reporter=verbose` flag is essential for debugging intermittent test failures — the default reporter swallows useful output."

### Why This Matters

A codebase without captured learnings is a codebase that relies on oral tradition. When people leave, the knowledge leaves with them. When new people join, they repeat every mistake. A ten-minute write-up after a feature saves hours of rediscovery later.

---

## 11. Anti-Patterns

These are the patterns that undermine incremental delivery. Learn to recognize them in your own work.

### Committing Without Approval

The checkpoint exists for a reason. When you skip it — because you are confident, because it is a small change, because you are in a hurry — you remove the safety net that catches mistakes before they become permanent. The habit of stopping and asking is more valuable than any individual commit.

### Steps That Span Multiple Commits

If a step in your plan requires more than one commit, the step is too big. Break it down. A step that needs multiple commits is a sign that you are bundling unrelated changes or that you underestimated the complexity.

### Writing Code Before Tests

This is a TDD violation (Chapter 1), but it shows up here because it destroys incremental delivery. Code written without a test has no clear done criteria, no proof it works, and no protection against regression. Every step starts with RED.

### Plans That Change Silently

You realize mid-feature that the plan needs to change. You adjust your approach and keep going without updating the plan file. Now the plan says one thing and the code says another. When someone reviews your work, the plan is misleading. When you come back after a break, the plan is wrong. Update the plan. Get approval. Then continue.

### Keeping Plan Files After Feature Complete

A stale plan file is worse than no plan file. It creates confusion about whether the feature is done, whether there is remaining work, and whether the plan reflects reality. When the feature ships, delete the plan. The git history has the record.

### The "Just One More Thing" Trap

You finish your planned step and notice something nearby that could be improved. You fix it and include it in the same commit. Now your commit does two things instead of one. The "just one more thing" belongs in its own step, its own test, its own commit. Discipline means stopping when the step is done — not when you run out of improvements to make.

---

## Summary Checklist

Use this checklist at every stage of the workflow.

### Before Starting a Feature
- [ ] Plan file exists in `plans/` with goal, acceptance criteria, and steps
- [ ] Each step is describable in one sentence
- [ ] Each step has RED/GREEN/REFACTOR/MUTATE phases defined
- [ ] Plan has been reviewed and approved

### During Each Step
- [ ] Started with a failing test (RED)
- [ ] Wrote minimum code to pass (GREEN)
- [ ] Assessed refactoring opportunities (REFACTOR)
- [ ] Ran mutation testing to verify test quality (MUTATE)
- [ ] All tests pass
- [ ] Static analysis passes (typecheck + lint)
- [ ] Stopped and asked "Ready to commit?" before committing

### Before Opening a PR
- [ ] All acceptance criteria are met
- [ ] Full test suite passes
- [ ] Type checking passes with strict mode
- [ ] Linting passes with no new suppressions
- [ ] Mutation testing passes
- [ ] Refactoring opportunities have been addressed
- [ ] Glossary is up to date (DDD projects)
- [ ] PR is small enough to review in one sitting

### After Feature Completion
- [ ] All acceptance criteria verified
- [ ] Plan file deleted from `plans/`
- [ ] Learnings captured and documented
- [ ] No TODO comments left behind referencing this feature

---

> *"The goal is not to finish fast. The goal is to always be in a state where you could finish — and for the next step to be obvious."*
