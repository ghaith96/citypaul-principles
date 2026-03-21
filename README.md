# Principled TypeScript — A Human Course

A comprehensive, human-readable course for TypeScript engineers, generated from [citypaul's](https://github.com/citypaul) Claude workflow, skills, and CLAUDE.md guidelines.

## What This Is

Citypaul has built an exceptionally detailed set of AI coding guidelines — a system of skills, agents, and principles that encode decades of software engineering wisdom. Those guidelines are written *for an AI to follow*. This course translates them *for humans to understand*.

The goal isn't to memorise rules. It's to internalise the **mental models** behind them — so you make better decisions in situations the rules don't cover.

## The Source Material

Everything here is derived from citypaul's `.claude/` configuration:

- **`CLAUDE.md`** — the master philosophy document
- **Skills** — deep-dive patterns for TDD, testing, TypeScript, functional programming, hexagonal architecture, DDD, 12-factor, refactoring, planning, and more
- **Agents** — specialised review and analysis tools

The original guidelines live at `claude/.claude/` in this repo.

## Course Structure

All chapters are in `human_course/`. Start with the syllabus:

| File | Chapter |
|------|---------|
| [`00_Syllabus.md`](human_course/00_Syllabus.md) | Course overview & recommended reading order |
| [`01_Strict_TDD.md`](human_course/01_Strict_TDD.md) | TDD as a design discipline, not just a testing rule |
| [`02_Behavior_Driven_Testing.md`](human_course/02_Behavior_Driven_Testing.md) | Test what, not how — public API testing & factories |
| [`03_Mutation_Testing.md`](human_course/03_Mutation_Testing.md) | Proving your tests actually catch bugs |
| [`04_TypeScript_Strict_Mode.md`](human_course/04_TypeScript_Strict_Mode.md) | Making illegal states unrepresentable |
| [`05_Immutable_State_And_Functional_Patterns.md`](human_course/05_Immutable_State_And_Functional_Patterns.md) | Never change data — create new versions |
| [`06_Hexagonal_Architecture.md`](human_course/06_Hexagonal_Architecture.md) | Ports, adapters, and the dependency rule |
| [`07_Domain_Driven_Design.md`](human_course/07_Domain_Driven_Design.md) | Speaking the language of the business |
| [`08_Twelve_Factor_App.md`](human_course/08_Twelve_Factor_App.md) | Building for production from day one |
| [`09_Frontend_Testing.md`](human_course/09_Frontend_Testing.md) | Real browsers, real confidence — Vitest Browser Mode |
| [`10_Refactoring_Discipline.md`](human_course/10_Refactoring_Discipline.md) | Improving without breaking |
| [`11_Planning_And_Incremental_Delivery.md`](human_course/11_Planning_And_Incremental_Delivery.md) | Shipping ambitious features in small, safe steps |

## How Each Chapter Is Written

Every chapter follows the same structure:

1. **Philosophy First** — the mental model and *why* behind the practice
2. **Bad Code / Good Code** — TypeScript contrast examples you can learn from
3. **Checklist** — quick reference for when you're in the flow

## Key Principles at a Glance

- **TDD is non-negotiable** — every line of production code is written in response to a failing test
- **Test behavior, not implementation** — tests survive refactoring when they test through the public API
- **No `any`** — ever. Use `unknown` when the type is truly unknown
- **Immutable data only** — never mutate, always create new versions
- **Schema-first at trust boundaries** — validate with Zod at every system boundary
- **Domain logic at the centre** — hexagonal architecture keeps business rules free of infrastructure concerns
- **Config from environment** — never hardcode anything that varies between deploys

## Credits

All principles, patterns, and guidelines are authored by [citypaul](https://github.com/citypaul). This course is a human-readable translation of that work, intended to help engineers understand the *why* behind the rules.
