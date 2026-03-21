# Chapter 4: TypeScript Strict Mode — Making Illegal States Unrepresentable

## The Mental Model

Most engineers treat TypeScript's type system as a syntax checker — a thing that yells at you until you add the right annotation and move on. That framing misses the point entirely.

TypeScript's type system is a **design tool**. It lets you encode your domain's rules directly into the structure of your code so that entire categories of bugs become impossible at compile time. Not caught by tests. Not caught in code review. *Impossible.*

Strict mode is the difference between a type system that occasionally helps and one that actively prevents mistakes. When you turn on strict mode and commit to it fully, you stop writing defensive runtime checks for problems that should never exist. You stop debugging undefined-is-not-a-function at 2am. You move the cost of correctness from runtime (where it's expensive and unpredictable) to compile time (where it's cheap and deterministic).

Here's the principle that should guide every type you write:

> **If a state is invalid in your domain, it should be unrepresentable in your types.**

Every `any` is a trapdoor — a place where the compiler stops helping and you're back to writing JavaScript with extra steps. Every type assertion (`as SomeType`) is a promise the compiler can't verify. Every optional property you add "just in case" is a combinatorial explosion of states your code has to handle, most of which are probably nonsensical.

This chapter is about closing those trapdoors.

---

## The `any` Ban

`any` doesn't just disable type checking for the value it's assigned to. It's **viral** — it silently disables type checking for everything it touches.

### Bad: `any` as an Escape Hatch

```typescript
function parse(input: any) {
  return input.name; // No error. No safety. Could be anything.
}

const result = parse(42);
// result is typed as `any` — the unsafety has spread to the caller
console.log(result.toUpperCase()); // No compile error. Runtime crash.
```

The damage here isn't just inside `parse`. The return type is inferred as `any`, which means every call site loses type safety too. One `any` in a utility function can silently disable checking across your entire codebase.

### Good: `unknown` Forces You to Narrow

```typescript
function parse(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    "name" in input &&
    typeof (input as Record<string, unknown>).name === "string"
  ) {
    return (input as Record<string, unknown>).name as string;
  }
  throw new Error("Invalid input: expected object with string 'name' property");
}

const result = parse(someExternalData);
// result is typed as `string` — full safety restored
console.log(result.toUpperCase()); // Correct and type-safe.
```

`unknown` is the type-safe counterpart to `any`. It represents "I don't know what this is" without giving up. You can't do anything with an `unknown` value until you narrow it — and that narrowing is exactly the validation you should have been writing anyway.

**The rule**: If you're reaching for `any`, stop and ask: "Do I truly not know this type, or am I just being lazy?" If you truly don't know, use `unknown`. If you do know, write the type.

---

## `type` vs `interface` — A Design Decision

This is not a syntax preference. It's a semantic choice that communicates intent.

### `type` — For Data Structures

Use `type` when you're describing the shape of data: what something *is*.

```typescript
// Unions — only possible with `type`
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Intersections
type AdminUser = User & { permissions: Permission[] };

// Mapped types
type Readonly<T> = { readonly [K in keyof T]: T[K] };

// Immutable data
type Config = Readonly<{
  apiUrl: string;
  timeout: number;
  retries: number;
}>;
```

`type` supports unions, intersections, mapped types, conditional types, and template literal types. It's the right tool for modelling data and its transformations.

### `interface` — For Behavior Contracts

Use `interface` when you're describing what something *can do* — a contract that must be fulfilled.

```typescript
// A contract for anything that can be serialized
interface Serializable {
  serialize(): string;
  deserialize(data: string): void;
}

// A contract for repository implementations
interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: UserId): Promise<void>;
}

// A class fulfilling the contract
class PostgresUserRepository implements UserRepository {
  async findById(id: UserId): Promise<User | null> {
    // ...
  }
  async save(user: User): Promise<void> {
    // ...
  }
  async delete(id: UserId): Promise<void> {
    // ...
  }
}
```

`interface` signals "this must be implemented." It works with `implements`, supports declaration merging (useful for extending third-party types), and clearly communicates that you're defining a boundary.

### The Heuristic

| Question | Answer |
|---|---|
| Am I describing what data looks like? | Use `type` |
| Am I describing what something can do? | Use `interface` |
| Do I need unions or intersections? | Use `type` |
| Will classes implement this? | Use `interface` |

---

## Schema-First Development with Zod

Types disappear at runtime. They can't validate an API response, check user input, or verify that the JSON you parsed actually matches what you expect. This is the trust boundary problem.

### The Rule: Validate at Trust Boundaries

A trust boundary is anywhere data enters your system from the outside:

- API responses from third-party services
- User input from forms or URL parameters
- Data read from files, databases, or environment variables
- Messages from message queues or websockets

At these boundaries, you need runtime validation *and* static types. Zod gives you both from a single source.

### Derive Types from Schemas

```typescript
import { z } from "zod";

// The schema IS the source of truth
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["admin", "member", "guest"]),
  createdAt: z.string().datetime(),
});

// The type is derived — never defined separately
type User = z.infer<typeof UserSchema>;
// Equivalent to:
// type User = {
//   id: string;
//   email: string;
//   name: string;
//   role: "admin" | "member" | "guest";
//   createdAt: string;
// }
```

**Never** duplicate a schema by writing both a Zod schema and a separate `type` or `interface` for the same data. They will drift apart, and the bugs that follow are exactly the kind that type systems are supposed to prevent.

### Using Schemas at Boundaries

```typescript
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  const data: unknown = await response.json();

  // Validate and parse — throws ZodError if invalid
  return UserSchema.parse(data);
}
```

After `UserSchema.parse()`, you have a fully typed `User` that you *know* matches the schema. The `unknown` to `User` transition is safe because it went through runtime validation.

### When Schemas Are NOT Needed

Not everything needs a Zod schema. Use plain types for:

- **Pure internal types**: If data never crosses a trust boundary, a `type` is sufficient.
- **Result types and domain logic types**: `type Result<T, E>` doesn't need runtime validation.
- **Component props**: Unless the props come from URL params or an API, a `type` is fine.
- **Utility types and generics**: These are compile-time constructs with no runtime representation.

The key question: "Does this data come from somewhere I don't control?" If yes, validate with a schema. If no, a type is enough.

---

## Branded Types for Compile-Time Safety

Primitive obsession is one of the most common sources of bugs. When half your function signatures look like `(string, string, string, number)`, you are one argument swap away from a production incident.

### Bad: Stringly-Typed APIs

```typescript
function processPayment(userId: string, orderId: string, amount: number) {
  // ...
}

const userId = "user_abc123";
const orderId = "order_xyz789";

// Swapped arguments — compiles fine, fails silently at runtime
processPayment(orderId, userId, 100);
```

The compiler can't help here because both `userId` and `orderId` are `string`. They're semantically different but structurally identical.

### Good: Branded Types Make the Swap Impossible

```typescript
// Define branded types
type UserId = string & { readonly __brand: unique symbol };
type OrderId = string & { readonly __brand: unique symbol };
type Cents = number & { readonly __brand: unique symbol };

// Factory functions — the only way to create branded values
function UserId(id: string): UserId {
  return id as UserId;
}

function OrderId(id: string): OrderId {
  return id as OrderId;
}

function Cents(amount: number): Cents {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Cents must be a non-negative integer");
  }
  return amount as Cents;
}

// The function signature now encodes the correct order
function processPayment(userId: UserId, orderId: OrderId, amount: Cents) {
  // ...
}

const userId = UserId("user_abc123");
const orderId = OrderId("order_xyz789");

// Compile error: Argument of type 'OrderId' is not assignable to parameter of type 'UserId'
processPayment(orderId, userId, Cents(100));

// Correct — compiles fine
processPayment(userId, orderId, Cents(100));
```

The `& { readonly __brand: unique symbol }` intersection creates a type that is structurally incompatible with plain strings and with other branded types, even though at runtime it's still just a string. The compiler enforces the distinction; the runtime cost is zero.

### When to Use Branded Types

Use them whenever you have multiple values of the same primitive type that mean different things:

- IDs: `UserId`, `OrderId`, `ProductId`
- Units: `Cents`, `Dollars`, `Milliseconds`, `Seconds`
- Validated strings: `Email`, `Url`, `NonEmptyString`

The factory function is the perfect place to add runtime validation too, as shown in the `Cents` example above. One place to create the value, one place to validate it.

---

## The Critical tsconfig Flags

Beyond `"strict": true`, there are several flags that close remaining gaps in TypeScript's safety net.

### `noUncheckedIndexedAccess`

**What it does**: Array and object index access returns `T | undefined` instead of `T`.

```typescript
// Without noUncheckedIndexedAccess:
const items = ["a", "b", "c"];
const item = items[5]; // type: string — lie! It's undefined at runtime.
console.log(item.toUpperCase()); // No error. Runtime crash.

// With noUncheckedIndexedAccess:
const items = ["a", "b", "c"];
const item = items[5]; // type: string | undefined — honest.
console.log(item.toUpperCase()); // Compile error: 'item' is possibly 'undefined'.

// You must handle the possibility:
if (item !== undefined) {
  console.log(item.toUpperCase()); // Safe.
}
```

**Why it matters**: Every array-out-of-bounds bug and every missing-key-on-record bug becomes a compile error. Yes, it means more `undefined` checks. That's the point — those checks represent real possibilities your code was ignoring.

### `exactOptionalPropertyTypes`

**What it does**: Distinguishes between "this property might not exist" (`property?: T`) and "this property exists but might be undefined" (`property: T | undefined`).

```typescript
// Without exactOptionalPropertyTypes:
type Config = { timeout?: number };
const config: Config = { timeout: undefined }; // Allowed — but probably wrong.

// With exactOptionalPropertyTypes:
type Config = { timeout?: number };
const config: Config = { timeout: undefined }; // Compile error!
// If timeout is optional, omit it entirely:
const config: Config = {}; // Correct.

// If you genuinely need to allow explicit undefined:
type Config = { timeout?: number | undefined };
const config: Config = { timeout: undefined }; // Now explicitly allowed.
```

**Why it matters**: `"timeout" in config` behaves differently when `timeout` is `undefined` vs absent. This flag forces you to be precise about which you mean. It catches bugs where code checks for property existence but the property was explicitly set to `undefined`.

### `noUnusedParameters`

**What it does**: Errors on function parameters that are never used in the function body.

```typescript
// Compile error: 'logger' is declared but its value is never read.
function processOrder(order: Order, logger: Logger) {
  return validateOrder(order);
}
```

**Why it matters**: An unused parameter isn't just dead code — it's often a signal that the function is at the wrong layer of abstraction, or that a planned integration was never completed. Prefix intentionally unused parameters with an underscore: `_logger`.

### Recommended tsconfig Settings

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Start with all of these on for new projects. For existing projects, enable them one at a time and fix the errors — each flag you enable is a category of bugs you'll never have to debug again.

---

## Making Illegal States Unrepresentable with Discriminated Unions

This is where everything in this chapter comes together. Discriminated unions let you model your domain so precisely that invalid states can't be constructed.

### Bad: Boolean Flags and Optional Fields

```typescript
type User = {
  id: string;
  email: string;
  isVerified: boolean;
  verifiedAt?: Date;
  verificationCode?: string;
};

// All of these type-check, but most are nonsensical:
const user1: User = { id: "1", email: "a@b.c", isVerified: true };
// Verified but no verifiedAt? When were they verified?

const user2: User = { id: "2", email: "a@b.c", isVerified: false, verifiedAt: new Date() };
// Not verified but has a verification date? What?

const user3: User = { id: "3", email: "a@b.c", isVerified: true, verificationCode: "abc123" };
// Verified but still has a pending verification code?
```

The type allows eight combinations of the three optional/boolean fields, but only two or three are valid. Every function that handles a `User` has to defensively check which combination it received.

### Good: Discriminated Union — Only Valid States Exist

```typescript
type UnverifiedUser = {
  id: string;
  email: string;
  status: "unverified";
  verificationCode: string;
};

type VerifiedUser = {
  id: string;
  email: string;
  status: "verified";
  verifiedAt: Date;
};

type User = UnverifiedUser | VerifiedUser;
```

Now:

- A verified user **always** has a `verifiedAt` date. It's required, not optional.
- An unverified user **always** has a `verificationCode`. It's required, not optional.
- There is no way to construct a "verified user without a date" or an "unverified user with a verification date." The type system forbids it.

### Exhaustive Handling with `never`

The `never` type lets you guarantee at compile time that you've handled every variant.

```typescript
function getUserStatusMessage(user: User): string {
  switch (user.status) {
    case "unverified":
      return `Please verify your email. Code: ${user.verificationCode}`;
    case "verified":
      return `Verified on ${user.verifiedAt.toLocaleDateString()}`;
    default: {
      // If you add a new status later and forget to handle it here,
      // this line will produce a compile error.
      const _exhaustive: never = user;
      return _exhaustive;
    }
  }
}
```

If you later add a `"suspended"` status to the `User` union, the `never` assignment will fail because `SuspendedUser` is not assignable to `never`. The compiler forces you to handle every case. No forgotten branches. No fallthrough bugs.

### A More Complex Example: Async Data States

```typescript
type AsyncData<T, E = Error> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; data: T }
  | { state: "error"; error: E };

function renderUserProfile(async: AsyncData<User>): string {
  switch (async.state) {
    case "idle":
      return "Click to load profile";
    case "loading":
      return "Loading...";
    case "success":
      // TypeScript knows `async.data` exists and is `User`
      return `Hello, ${async.data.email}`;
    case "error":
      // TypeScript knows `async.error` exists and is `Error`
      return `Failed: ${async.error.message}`;
    default: {
      const _exhaustive: never = async;
      return _exhaustive;
    }
  }
}
```

No more `if (data && !loading && !error)` spaghetti. Each state is a distinct, well-typed variant. You can't access `data` in the loading state or `error` in the success state — the compiler won't let you.

---

## Summary Checklist

Use this as a reference when writing and reviewing TypeScript code.

- [ ] **No `any`**. Use `unknown` for truly unknown types and narrow with type guards.
- [ ] **`type` for data, `interface` for contracts.** Choose based on intent, not habit.
- [ ] **Zod schemas at trust boundaries.** Derive types with `z.infer` — never duplicate a schema as both Zod and a manual type.
- [ ] **Branded types for semantically distinct primitives.** If swapping two arguments of the same type would be a bug, brand them.
- [ ] **`noUncheckedIndexedAccess` is on.** Every index access honestly returns `T | undefined`.
- [ ] **`exactOptionalPropertyTypes` is on.** Optional means absent, not `undefined`.
- [ ] **`noUnusedParameters` is on.** Dead parameters signal architectural issues.
- [ ] **Boolean flags replaced with discriminated unions.** If a combination of fields is invalid in your domain, make it unrepresentable in your types.
- [ ] **Exhaustive switches use `never`.** Adding a new variant to a union produces compile errors everywhere it's unhandled.
- [ ] **Type assertions (`as`) are rare and justified.** Each one is a promise you're making on the compiler's behalf — make sure you can keep it.
