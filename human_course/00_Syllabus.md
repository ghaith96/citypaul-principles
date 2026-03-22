# The Citypaul Principles

## A Human-Readable Guide to Principled TypeScript Development

**Who this is for:** TypeScript engineers who want to understand *why* these practices exist, not just *what* the rules are. Each chapter teaches the mental model first, then shows you the code.

**How to read:** Chapters build on each other. TDD is the foundation everything else rests on. Immutability and strict typing make TDD possible at scale. Architecture chapters show how these principles compose into systems.

---

## Part I: The Foundation

### Chapter 1 — Strict TDD: The Non-Negotiable Practice
*Why every line of production code must be born from a failing test.*

Red-Green-Refactor as a thinking discipline. Why "I'll add tests later" is a lie you tell yourself. The commit cadence that keeps you safe. How TDD changes the way you design code, not just verify it.

### Chapter 2 — Behavior-Driven Testing: Test What, Not How
*The art of writing tests that survive refactoring.*

Why testing implementation details creates a maintenance nightmare. The public API principle. Test factory patterns that eliminate shared mutable state. Why `let` and `beforeEach` are testing anti-patterns. Coverage theater vs. real coverage.

### Chapter 3 — Mutation Testing: Proving Your Tests Actually Work
*Code coverage lies. Mutation testing tells the truth.*

Why 100% line coverage can miss 40% of bugs. The mental model of introducing tiny bugs and checking if tests catch them. Boundary values, identity values, and the operators most likely to survive. How to think like a mutant.

---

## Part II: The Type System as Your Ally

### Chapter 4 — TypeScript Strict Mode: Making Illegal States Unrepresentable
*How to make the compiler catch bugs before you even run the code.*

Why `any` is a trapdoor. The `type` vs `interface` decision. Branded types for compile-time safety. `noUncheckedIndexedAccess` and other flags that change everything. Schema-first development with Zod at trust boundaries.

### Chapter 5 — Immutable State & Functional Patterns
*Why you should never change data — only create new versions of it.*

The mental model of values vs. references. Why mutation creates spooky action at a distance. The complete catalog of immutable array/object operations. Pure functions, composition, early returns. "Functional Light" — practical FP without the academic baggage.

---

## Part III: Architecture That Scales

### Chapter 6 — Hexagonal Architecture: Ports, Adapters, and the Dependency Rule
*Business logic at the center. Everything else plugs in.*

Why your domain should never know about databases or HTTP. Ports as contracts, adapters as implementations. The "impureim sandwich" for dependency injection. Driving vs. driven adapters. CQRS-lite for when reads and writes need different shapes.

### Chapter 7 — Domain-Driven Design: Speaking the Language of the Business
*Code that reads like the domain expert talks.*

Ubiquitous language and why naming is the hardest part. Value objects, entities, and aggregates. Making illegal states unrepresentable with discriminated unions. Domain services vs. use cases. When DDD is overkill and when it's essential.

### Chapter 8 — The Twelve-Factor App: Building for Production
*Principles for applications that deploy, scale, and survive.*

Config as environment variables with schema validation. Backing services as attached resources. Stateless processes, graceful shutdown, structured logging. Why dev/prod parity prevents 3 AM surprises.

---

## Part IV: The Workflow

### Chapter 9 — Front-End Testing: Real Browsers, Real Confidence
*Why jsdom is a lie, and how Vitest Browser Mode changes everything.*

The two users of your UI (end-users and developers). Accessibility-first query selection. Why `userEvent` beats `fireEvent`. The MSW pattern for API mocking. React-specific patterns: hooks, context, and the render factory.

### Chapter 10 — Refactoring Discipline: Improving Without Breaking
*The third step of TDD that most people skip.*

When to refactor and when to leave code alone. The priority classification system. DRY means knowledge duplication, not code duplication. Why you must commit before refactoring. Speculative code as a TDD violation.

### Chapter 11 — Planning & Incremental Delivery
*How to ship ambitious features in small, safe steps.*

What makes a "known-good increment." Step size heuristics. The plan file as a contract. Why small PRs are a gift to your team. The full workflow: plan, RED-GREEN-REFACTOR-MUTATE, commit, repeat.

---

## Appendix

Each chapter includes:
- **The Mental Model** — the *why* behind the practice
- **Bad Code / Good Code** — contrast examples you can learn from
- **A Checklist** — for quick reference when you're in the flow

---

*This course is derived from the [citypaul CLAUDE.md guidelines](../claude/.claude/CLAUDE.md) — a set of AI-assisted development rules that encode decades of software engineering wisdom. The principles are timeless; the rules are just how we enforce them.*
