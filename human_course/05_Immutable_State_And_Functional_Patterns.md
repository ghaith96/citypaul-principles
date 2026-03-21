# Chapter 5: Immutable State & Functional Patterns

## Never Change Data — Create New Versions

---

There is a class of bug that every engineer encounters eventually. It is subtle, it is maddening, and it hides behind perfectly reasonable-looking code. Something, somewhere, changed a piece of data you were relying on. You did not change it. You did not ask for it to change. But it changed, and now your system is in an impossible state.

This chapter is about eliminating that entire category of bug. Not with discipline or code reviews or "being careful" — but with patterns and types that make the bug structurally impossible.

We will also cover a set of complementary practices — pure functions, composition, self-documenting code — that together form what we call "Functional Light." These are not academic exercises. They are the practical habits that make TypeScript codebases predictable, testable, and genuinely pleasant to work in.

---

## 1. Why Immutability Matters — The "Spooky Action at a Distance" Problem

Einstein famously objected to quantum entanglement by calling it "spooky action at a distance." Mutable state gives you exactly the same problem in code: something changes over *here*, and something breaks over *there*, with no visible connection between the two.

### The Problem

```typescript
// BAD: Mutation hidden inside a function
function grantPermission(user: User, permission: string): void {
  user.permissions.push(permission);
}

// Caller has no idea their data just changed
const user = { name: 'Alice', permissions: ['read'] };
grantPermission(user, 'write');

// Surprise — user.permissions is now ['read', 'write']
// Every other piece of code holding a reference to this user
// just had its data changed without consent.
```

The caller passed `user` to `grantPermission` expecting it to *use* the data. Instead, the function reached into the caller's data and rewrote it. Any other function, component, or module that holds a reference to the same `user` object now sees different data than it did a moment ago.

This is not a contrived example. This is how most bugs in stateful systems are born.

### The Solution

```typescript
// GOOD: Return a new object, leave the original untouched
function grantPermission(user: User, permission: string): User {
  return {
    ...user,
    permissions: [...user.permissions, permission],
  };
}

const user = { name: 'Alice', permissions: ['read'] };
const updatedUser = grantPermission(user, 'write');

// user.permissions        => ['read']         (unchanged)
// updatedUser.permissions => ['read', 'write'] (new object)
```

The original `user` is untouched. The function communicates clearly through its return type that it produces a *new* `User`. The caller decides what to do with the result. No spooky action at a distance.

### Why This Matters Beyond Correctness

| Benefit | Explanation |
|---|---|
| **Predictable** | If nothing mutates, the only way state changes is through explicit reassignment. You can trace every change. |
| **Debuggable** | You can log previous and next state side by side. Time-travel debugging becomes trivial. |
| **Testable** | Pure functions with immutable data need no setup or teardown. Pass input, assert output. |
| **React-friendly** | React's rendering model depends on reference equality checks. Mutation breaks `React.memo`, `useMemo`, and the entire reconciliation model. |
| **Concurrency-safe** | Data that never changes can be shared freely across threads, workers, or async boundaries without locks or races. |

---

## 2. "Functional Light" — Practical FP Without the Academic Baggage

Functional programming has a reputation problem. Mention it in a team meeting and someone will start talking about monads, functors, and category theory. That is not what we are doing here.

### What We Do

- **Pure functions** — same input, same output, no side effects
- **Immutable data** — never mutate, always create new versions
- **Composition** — build complex behaviour from small, focused functions
- **Array methods** — `map`, `filter`, `reduce` over imperative loops
- **Type safety** — let the compiler enforce our constraints

### What We Do Not Do

- **Category theory** — we are writing business software, not proving theorems
- **Monads and fp-ts** — powerful tools, but they impose a learning curve that rarely pays off in application code
- **Point-free everything** — readability always wins over cleverness
- **Over-engineering** — if a simple `if` statement is clear, use it

The goal is maintainable, testable code that any competent TypeScript engineer can read and modify. Not academic purity. Not clever abstractions. Practical patterns that reduce bugs and make the codebase easier to reason about.

---

## 3. Pure Functions

A pure function has two properties:

1. **No side effects** — it does not modify anything outside itself (no mutating arguments, no writing to databases, no logging, no DOM manipulation)
2. **Deterministic** — given the same inputs, it always returns the same output

A function with these properties is *referentially transparent*: you can replace the function call with its return value and the program behaves identically. This is what makes pure functions so easy to test and reason about.

### Bad: Mutating the Input

```typescript
// BAD: Mutates the array passed in — caller's data is corrupted
function addScenario(scenarios: Scenario[], newScenario: Scenario): void {
  scenarios.push(newScenario);
}
```

The caller gives you their array. You destroy it. The function returns `void`, which is a code smell in itself — a function that returns nothing is either performing a side effect or doing nothing useful.

### Good: Returning a New Array

```typescript
// GOOD: Returns a new array, input is untouched
const addScenario = (
  scenarios: ReadonlyArray<Scenario>,
  newScenario: Scenario,
): ReadonlyArray<Scenario> => [...scenarios, newScenario];
```

The type signature tells the full story: it takes a `ReadonlyArray` (cannot be mutated), takes a new scenario, and returns a new `ReadonlyArray`. The compiler will stop you if you accidentally try to `.push()` on the input.

### The Pure Core, Impure Shell

Real applications have side effects. They read from databases, call APIs, write to disk. The strategy is not to eliminate side effects — it is to *isolate* them.

```
┌─────────────────────────────────────────┐
│           Impure Shell                  │
│  (HTTP handlers, DB queries, logging)   │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │         Pure Core               │   │
│   │  (validation, transformation,   │   │
│   │   business rules, calculations) │   │
│   └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

Push all impurity to the edges of your system. The HTTP handler reads the request (impure), calls pure functions to validate and transform (pure), then writes the response (impure). The pure core — where your actual business logic lives — is trivially testable.

---

## 4. The Complete Immutable Operations Catalog

Every mutation has an immutable equivalent. Learn these patterns once, and you will never need to mutate again.

### Arrays

#### Adding an element (replaces `push`)

```typescript
// BAD
items.push(newItem);

// GOOD — append
const updated = [...items, newItem];

// GOOD — prepend
const updated = [newItem, ...items];
```

#### Removing the last element (replaces `pop`)

```typescript
// BAD
items.pop();

// GOOD
const updated = items.slice(0, -1);
```

#### Removing elements at an index (replaces `splice`)

```typescript
// BAD
items.splice(index, 1);

// GOOD
const updated = [...items.slice(0, index), ...items.slice(index + 1)];
```

#### Inserting at a position (replaces `splice` for insertion)

```typescript
// BAD
items.splice(index, 0, newItem);

// GOOD
const updated = [
  ...items.slice(0, index),
  newItem,
  ...items.slice(index),
];
```

#### Sorting (replaces in-place `sort`)

```typescript
// BAD — sort mutates the original array
items.sort((a, b) => a.name.localeCompare(b.name));

// GOOD — spread into a new array first
const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

// GOOD (ES2023+) — toSorted returns a new array
const sorted = items.toSorted((a, b) => a.name.localeCompare(b.name));
```

#### Updating an element at a specific index (replaces direct index assignment)

```typescript
// BAD
items[index] = newValue;

// GOOD
const updated = items.map((item, i) => (i === index ? newValue : item));
```

#### Filtering out elements

```typescript
// Remove all inactive users
const activeUsers = users.filter((user) => user.isActive);

// Remove a specific item by ID
const remaining = items.filter((item) => item.id !== targetId);
```

#### Replacing a specific item by ID

```typescript
const updated = items.map((item) =>
  item.id === targetId ? { ...item, status: 'completed' } : item,
);
```

### Objects

#### Updating a property (replaces direct assignment)

```typescript
// BAD
user.name = 'Bob';

// GOOD
const updated = { ...user, name: 'Bob' };
```

#### Updating multiple properties

```typescript
// BAD
user.name = 'Bob';
user.role = 'admin';

// GOOD
const updated = { ...user, name: 'Bob', role: 'admin' };
```

#### Removing a property

```typescript
// GOOD — destructure out the unwanted key
const { password, ...userWithoutPassword } = user;
```

### Nested Updates

Nested immutable updates are the most verbose part of this pattern. Accept the verbosity — it is the price of explicitness.

```typescript
// Updating an item inside a nested array
const updatedCart = {
  ...cart,
  items: cart.items.map((item) =>
    item.productId === targetId
      ? { ...item, quantity: item.quantity + 1 }
      : item,
  ),
};
```

```typescript
// Updating a deeply nested property
const updatedConfig = {
  ...config,
  database: {
    ...config.database,
    pool: {
      ...config.database.pool,
      maxConnections: 20,
    },
  },
};
```

If your nested updates become deeply unreadable (4+ levels), that is a signal that your data structure may need flattening — not that you need a mutation escape hatch.

---

## 5. `readonly` and `ReadonlyArray` — Let the Compiler Enforce It

Discipline is unreliable. Types are not. TypeScript gives you the tools to make mutation a compile-time error.

### Mark All Properties as `readonly`

```typescript
// BAD: Nothing stops mutation
interface User {
  name: string;
  email: string;
  permissions: string[];
}

// GOOD: Compiler rejects mutation
interface User {
  readonly name: string;
  readonly email: string;
  readonly permissions: ReadonlyArray<string>;
}

const user: User = { name: 'Alice', email: 'a@b.com', permissions: ['read'] };
user.name = 'Bob';              // Compile error
user.permissions.push('write'); // Compile error
```

### Use `ReadonlyArray<T>` for All Array Types

```typescript
// BAD
function processItems(items: string[]): void {
  items.sort(); // Allowed — mutates the caller's array
}

// GOOD
function processItems(items: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...items].sort();
}
```

`ReadonlyArray<T>` removes `push`, `pop`, `splice`, `sort`, and every other mutating method from the type. The compiler will not let you accidentally mutate.

### Deep Immutability for Nested Objects

For complex nested types, create a utility type that recursively applies `readonly`:

```typescript
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? T[P] extends Function
      ? T[P]
      : DeepReadonly<T[P]>
    : T[P];
};

interface AppConfig {
  database: {
    host: string;
    pool: {
      min: number;
      max: number;
    };
  };
}

type ImmutableConfig = DeepReadonly<AppConfig>;
// Every nested property is now readonly — mutations at any depth are compile errors
```

### The Rule

Every `interface` and `type` in your codebase should use `readonly` properties and `ReadonlyArray`. Make immutability the default, and require justification for the rare cases where mutation is intentional.

---

## 6. Array Methods Over Loops

Imperative loops tell the computer *how* to do something step by step. Declarative array methods tell it *what* you want. The declarative style is easier to read, naturally immutable, and composes cleanly.

### Bad: Imperative Loop with Mutation

```typescript
// BAD: Manual loop, mutable accumulator, mixing concerns
function getActiveUserEmails(users: User[]): string[] {
  const emails: string[] = [];
  for (let i = 0; i < users.length; i++) {
    if (users[i].isActive) {
      emails.push(users[i].email.toLowerCase());
    }
  }
  return emails;
}
```

You have to mentally simulate the loop to understand what this function does. The mutable `emails` array is a bookkeeping detail that has nothing to do with the intent.

### Good: Declarative Chain

```typescript
// GOOD: Each step has a clear, single purpose
const getActiveUserEmails = (users: ReadonlyArray<User>): ReadonlyArray<string> =>
  users
    .filter((user) => user.isActive)
    .map((user) => user.email.toLowerCase());
```

Read it top to bottom: filter to active users, then extract lowercase emails. The intent is the code. No bookkeeping. No index management. No mutable accumulator.

### `reduce` for Aggregation

```typescript
// Sum all order totals
const totalRevenue = orders.reduce(
  (sum, order) => sum + order.total,
  0,
);

// Group items by category
const byCategory = items.reduce<Record<string, ReadonlyArray<Item>>>(
  (acc, item) => ({
    ...acc,
    [item.category]: [...(acc[item.category] ?? []), item],
  }),
  {},
);
```

### When Loops Are Acceptable

Array methods are the default. Loops are the exception, and they require justification:

- **Early termination** — if you need to stop processing after finding a match and `find` / `some` / `every` do not fit your use case
- **Performance-critical hot paths** — *measure first*. In nearly all application code, the difference is irrelevant. Only optimise when profiling proves a bottleneck exists.

Even in these cases, encapsulate the loop inside a well-named function so the imperative detail does not leak into the rest of your code.

---

## 7. No Comments — Self-Documenting Code

Comments are a failure of expression. If your code needs a comment to explain *what* it does, the code should be rewritten until it does not.

This does not mean "never write a comment." It means: exhaust every option for making the code self-explanatory first. Comments explaining *why* — business context, non-obvious constraints, regulatory requirements — are valuable. Comments explaining *what* — what a variable holds, what a conditional checks, what a function does — are a sign the code is not clear enough.

### Bad: Code That Needs Comments to Be Understood

```typescript
// BAD
function check(u: any): boolean {
  // Check if user exists
  if (u) {
    // Check if user has permissions
    if (u.perms) {
      // Check if user has admin permission
      if (u.perms.indexOf('admin') !== -1) {
        // Check if user is not suspended
        if (!u.suspended) {
          return true;
        }
      }
    }
  }
  return false;
}
```

Every comment here is papering over a naming failure. The parameter is `u` instead of `user`. The function is `check` instead of something meaningful. The type is `any` instead of `User`. The nested structure obscures the logic.

### Good: Self-Documenting Through Naming and Structure

```typescript
// GOOD
interface User {
  readonly permissions: ReadonlyArray<string>;
  readonly isSuspended: boolean;
}

function canUserPerformAdminActions(user: User | undefined): boolean {
  if (!user) return false;
  if (user.isSuspended) return false;
  if (!user.permissions.includes('admin')) return false;

  return true;
}
```

The function name says exactly what it determines. The parameter is typed, so you know what you are working with. The guard clauses read like a checklist of requirements. No comments needed — the code *is* the explanation.

### Naming Conventions That Eliminate Comments

| Instead of... | Use... |
|---|---|
| `// Check if valid` before an `if` | `const isValid = ...` or `if (isOrderValid(order))` |
| `// Calculate total with tax` | `const totalWithTax = calculateTotalWithTax(subtotal, taxRate)` |
| `// Temporary list of active users` | `const activeUsers = users.filter(...)` |
| `// This handles the edge case where...` | Extract to a function named after the edge case |

---

## 8. Options Objects Over Positional Parameters

When a function takes three or more parameters, switch to an options object. This is not a style preference — it is a readability and maintenance requirement.

### Bad: Positional Parameters

```typescript
// BAD: What do these arguments mean?
createPayment(100, 'GBP', 'card_123', '123', true, false);

// Even the author will not remember what the booleans mean in two weeks.
```

You cannot read this call site without jumping to the function definition. The booleans are especially dangerous — `true, false` could mean anything, and swapping them is a silent bug.

### Good: Options Object

```typescript
// GOOD: Every argument is self-documenting
interface CreatePaymentOptions {
  readonly amount: number;
  readonly currency: string;
  readonly cardId: string;
  readonly cvv: string;
  readonly saveCard: boolean;
  readonly sendReceipt: boolean;
}

function createPayment(options: CreatePaymentOptions): Result<Payment, PaymentError> {
  const { amount, currency, cardId, cvv, saveCard, sendReceipt } = options;
  // ...
}

createPayment({
  amount: 100,
  currency: 'GBP',
  cardId: 'card_123',
  cvv: '123',
  saveCard: true,
  sendReceipt: false,
});
```

Now every value is labelled at the call site. You can read it without context. Adding new optional parameters does not break existing callers. Reordering properties is safe. TypeScript will catch any misspelled or missing required fields.

### The Threshold

- **1-2 parameters**: positional is fine — `formatCurrency(amount, currency)`
- **3+ parameters**: use an options object
- **Boolean parameters**: almost always warrant an options object, even if there are only two parameters — `enableFeature(featureId, { dryRun: true })` is far clearer than `enableFeature(featureId, true)`

---

## 9. Composition Over Complex Logic

Large functions are hard to read, hard to test, and hard to change. Small, focused functions composed together are easy on all three counts.

### Bad: Monolithic Function

```typescript
// BAD: One giant function doing validation, transformation, and persistence
async function registerScenario(input: unknown): Promise<void> {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input');
  }
  const data = input as Record<string, unknown>;
  if (typeof data.name !== 'string' || data.name.length === 0) {
    throw new Error('Name is required');
  }
  if (typeof data.name !== 'string' || data.name.length > 100) {
    throw new Error('Name too long');
  }
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error('Steps are required');
  }
  for (const step of data.steps) {
    if (typeof step !== 'object' || !step) {
      throw new Error('Invalid step');
    }
    // ... 30 more lines of validation
  }
  const scenario = {
    id: generateId(),
    name: data.name,
    steps: data.steps.map((s: any) => ({
      // ... transformation logic
    })),
    createdAt: new Date(),
  };
  await db.scenarios.insert(scenario);
  await eventBus.publish('scenario.created', scenario);
}
```

This function validates, transforms, persists, and publishes events. Testing any one of those concerns requires invoking all of them. Changing validation logic risks breaking persistence logic. The function is a monolith.

### Good: Composed from Small Functions

```typescript
// GOOD: Each function does one thing and is independently testable

// Pure — validates and returns a typed result
function validateScenarioInput(input: unknown): Result<ScenarioInput, ValidationError> {
  if (!input || typeof input !== 'object') {
    return { success: false, error: { field: 'root', message: 'Invalid input' } };
  }
  // ... focused validation logic
  return { success: true, data: validated };
}

// Pure — transforms validated input into a domain object
function buildScenario(input: ScenarioInput): Scenario {
  return {
    id: generateId(),
    name: input.name,
    steps: input.steps.map(buildStep),
    createdAt: new Date(),
  };
}

// Impure shell — composes the pure functions and handles side effects
async function registerScenario(input: unknown): Promise<Result<Scenario, ValidationError>> {
  const validationResult = validateScenarioInput(input);
  if (!validationResult.success) return validationResult;

  const scenario = buildScenario(validationResult.data);
  await db.scenarios.insert(scenario);
  await eventBus.publish('scenario.created', scenario);

  return { success: true, data: scenario };
}
```

Each piece is testable in isolation. The orchestrating function reads like a recipe: validate, build, persist, publish. The pure core (validation, building) is separated from the impure shell (database, events).

### Pipe-Style Composition

For synchronous transformations that flow linearly, a `pipe` utility makes the composition explicit:

```typescript
// A simple pipe for composing functions left to right
const pipe = <T>(...fns: Array<(arg: T) => T>) =>
  (initial: T): T =>
    fns.reduce((value, fn) => fn(value), initial);

const normaliseEmail = pipe(
  (email: string) => email.trim(),
  (email: string) => email.toLowerCase(),
  (email: string) => email.replace(/\+.*@/, '@'),
);

normaliseEmail('  Alice+Spam@EXAMPLE.COM  ');
// => 'alice@example.com'
```

---

## 10. Early Returns Over Nesting

Deeply nested code is hard to follow. Every level of indentation is a new context you must hold in your head. The rule: **maximum two levels of nesting**. Use guard clauses to eliminate the rest.

### Bad: Deep Nesting

```typescript
// BAD: Four levels of nesting — reader must track every branch
async function processOrder(orderId: string): Promise<void> {
  const order = await db.orders.findById(orderId);
  if (order) {
    if (order.status === 'pending') {
      const inventory = await checkInventory(order.items);
      if (inventory.allAvailable) {
        const payment = await chargeCard(order.paymentMethod, order.total);
        if (payment.success) {
          await fulfillOrder(order);
        } else {
          throw new Error('Payment failed');
        }
      } else {
        throw new Error('Items unavailable');
      }
    } else {
      throw new Error('Order not pending');
    }
  } else {
    throw new Error('Order not found');
  }
}
```

The happy path is buried four levels deep. You have to mentally match each `else` to its `if` to understand the error cases. The structure hides the logic.

### Good: Guard Clauses with Early Returns

```typescript
// GOOD: Flat structure, happy path reads top to bottom
async function processOrder(orderId: string): Promise<Result<Order, OrderError>> {
  const order = await db.orders.findById(orderId);
  if (!order) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } };
  }

  if (order.status !== 'pending') {
    return { success: false, error: { code: 'INVALID_STATUS', message: 'Order not pending' } };
  }

  const inventory = await checkInventory(order.items);
  if (!inventory.allAvailable) {
    return { success: false, error: { code: 'UNAVAILABLE', message: 'Items unavailable' } };
  }

  const payment = await chargeCard(order.paymentMethod, order.total);
  if (!payment.success) {
    return { success: false, error: { code: 'PAYMENT_FAILED', message: 'Payment failed' } };
  }

  const fulfilled = await fulfillOrder(order);
  return { success: true, data: fulfilled };
}
```

Each guard clause handles one failure case and exits. The happy path flows straight down the left margin. You can read the function linearly without tracking nested branches.

---

## 11. Result Type for Error Handling

Throwing exceptions is the mutation of control flow — it creates invisible paths through your code that callers may or may not handle. The `Result` type makes success and failure explicit in the type system.

### The Type

```typescript
type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };
```

This is a discriminated union. TypeScript knows that if `success` is `true`, `data` exists. If `success` is `false`, `error` exists. The compiler enforces exhaustive handling.

### Why Not Just Throw?

```typescript
// BAD: Caller has no idea this function can fail
function parseConfig(raw: string): AppConfig {
  const parsed = JSON.parse(raw); // Throws on invalid JSON
  if (!parsed.database) {
    throw new Error('Missing database config'); // Another throw
  }
  return parsed as AppConfig;
}

// Caller does not know they need a try/catch — nothing in the type tells them
const config = parseConfig(rawInput);
```

The function signature says it returns `AppConfig`. It lies. It might throw. TypeScript cannot enforce that callers handle the error because exceptions are invisible to the type system.

### Result Makes Failure Explicit

```typescript
// GOOD: Return type tells the full story
interface ConfigError {
  readonly code: 'INVALID_JSON' | 'MISSING_FIELD';
  readonly message: string;
}

function parseConfig(raw: string): Result<AppConfig, ConfigError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON' } };
  }

  if (!isValidConfig(parsed)) {
    return { success: false, error: { code: 'MISSING_FIELD', message: 'Missing required fields' } };
  }

  return { success: true, data: parsed };
}
```

### Callers Must Handle Both Cases

```typescript
const result = parseConfig(rawInput);

if (!result.success) {
  // TypeScript knows result.error exists here
  logger.error(`Config parse failed: ${result.error.message}`);
  process.exit(1);
}

// TypeScript knows result.data exists here — it is AppConfig
startServer(result.data);
```

You cannot accidentally ignore the error. The type system will not let you access `result.data` without first checking `result.success`. This is not a convention you hope people follow — it is a constraint the compiler enforces.

### Composing Results

```typescript
function loadAndValidateConfig(path: string): Result<AppConfig, ConfigError> {
  const readResult = readFile(path);
  if (!readResult.success) return readResult;

  const parseResult = parseConfig(readResult.data);
  if (!parseResult.success) return parseResult;

  const validationResult = validateConfig(parseResult.data);
  if (!validationResult.success) return validationResult;

  return validationResult;
}
```

Each step short-circuits on failure. The happy path flows linearly. Every error is typed and handled. No try/catch nesting. No exception gymnastics.

### When Exceptions Are Still Appropriate

- **Truly exceptional situations** — out of memory, programmer errors (accessing undefined), situations where recovery is not possible or meaningful
- **At system boundaries** — frameworks like Express expect thrown errors for middleware handling. Throw at the boundary, use Results internally.

The rule: use `Result` for *expected* failures (validation errors, not-found, permission denied). Use exceptions for *unexpected* failures (bugs, infrastructure collapse).

---

## Summary Checklist

Use this as a quick reference when writing or reviewing code.

### Immutability

- [ ] Functions return new data instead of mutating inputs
- [ ] All interface properties are `readonly`
- [ ] All arrays are typed as `ReadonlyArray<T>`
- [ ] Nested updates use spread at every level
- [ ] No `.push()`, `.pop()`, `.splice()`, or `.sort()` on shared data

### Pure Functions

- [ ] Functions are deterministic — same input, same output
- [ ] Side effects are isolated at system boundaries (pure core, impure shell)
- [ ] Function return type is never `void` unless it is a boundary effect

### Code Style

- [ ] Array methods (`map`, `filter`, `reduce`) are used over imperative loops
- [ ] No comments explaining *what* — only *why* when business context demands it
- [ ] Functions with 3+ parameters use an options object
- [ ] Maximum two levels of nesting — use guard clauses and early returns
- [ ] Large functions are decomposed into small, composable pieces

### Error Handling

- [ ] Expected failures use `Result<T, E>`, not thrown exceptions
- [ ] Callers are forced by the type system to handle both success and failure
- [ ] Error types are specific and meaningful, not generic strings

### The One Principle Behind All of This

Every pattern in this chapter serves the same goal: **make the code's behaviour obvious from its structure and types, so you never have to guess what it does, wonder what it changes, or hope that errors are handled.**

If you follow one rule, follow this: write code that a tired engineer at 2 AM can read, understand, and modify without introducing a bug. Immutability, pure functions, self-documenting names, explicit error handling — these are all just ways of being kind to that future engineer. Who will probably be you.
