# Chapter 7: Domain-Driven Design — Speaking the Language of the Business

## Why This Chapter Exists

Most software fails not because of bad algorithms or slow databases but because the code
doesn't reflect how the business actually works. A user says "place an order" and a
developer writes `updateStatus(3)`. A product manager says "the gift idea needs an
occasion" and a developer adds `parentId: string`. The gap between the language of the
business and the language of the code is where bugs, miscommunication, and accidental
complexity live.

Domain-Driven Design is a set of thinking tools — not a framework — for closing that gap.
It asks one deceptively simple question: **what if the code read like a conversation with
a domain expert?**

This chapter won't turn you into an Eric Evans scholar overnight. It will give you the
mental models and practical TypeScript patterns to start writing code that mirrors the
problem domain rather than fighting it.

---

## 1. When to Use DDD (and When Not To)

DDD has a cost. It forces you to think harder about naming. It introduces types and
boundaries you wouldn't bother with in a weekend project. That cost is only justified
when the domain itself is complex enough to warrant it.

### The Complexity Litmus Test

Ask yourself:

- Are there business rules that change based on context? (e.g., pricing differs by region, user tier, time of day)
- Do domain experts use specialized vocabulary you need to learn?
- Are there workflows with multiple valid states and transitions?
- Would two domain experts occasionally disagree about a rule?

If the answer to most of these is **yes**, DDD pays for itself quickly. If your app is a
thin wrapper around a database with straightforward CRUD operations, DDD will feel like
wearing a suit of armour to walk to the postbox.

### Start Simple, Evolve Deliberately

You don't adopt DDD all at once. The progression looks like this:

1. **Start with Ubiquitous Language.** Name things the way the business names them. This costs nothing and pays immediately.
2. **Introduce Value Objects.** Replace primitive strings and numbers with types that carry meaning and validation.
3. **Model entities with always-valid construction.** Push invariants into constructors and transitions.
4. **Add aggregates and domain services** only when you discover that entities alone can't express the rules cleanly.

Resist the temptation to start at step 4. Every unnecessary abstraction is a tax on every
future reader of your code.

---

## 2. Ubiquitous Language — The Most Important DDD Concept

If you take nothing else from this chapter, take this: **the code must speak the language
of the domain.**

Every type name, every function name, every variable — these are not arbitrary labels
chosen for a developer's convenience. They are the shared vocabulary between your team
and the people who understand the problem space. When a product manager says "occasion"
and your code says "parentId", someone will misunderstand something, and that
misunderstanding will ship as a bug.

### Bad: Technical Names Disconnected from the Domain

```typescript
type Item = {
  id: string;
  text: string;
  parentId: string;
  amount: number;
  currency: string;
};

function process(item: Item): void {
  // What domain concept does "process" represent?
  // What is "text"? A description? A title? A note?
  // What is "parentId"? A category? An occasion? A user?
}
```

Every name here forces the next developer to reverse-engineer intent. "Item" could be
anything. "process" could mean anything. The code compiles, but it doesn't communicate.

### Good: Domain Language in Every Name

```typescript
type GiftIdea = {
  id: GiftIdeaId;
  description: string;
  occasion: OccasionId;
  estimatedCost: Money;
};

function suggestGiftIdea(idea: GiftIdea, recipient: Recipient): SuggestionResult {
  // The function name tells you what business action this is.
  // The types tell you what domain concepts are involved.
  // A new team member can read this and understand the intent.
}
```

### Maintain a Glossary

Create a `GLOSSARY.md` (or a `glossary.ts` with type aliases and comments) in your
project root. Every domain term gets a one-line definition agreed upon by the team and
the domain experts.

```markdown
## Project Glossary

- **Gift Idea**: A suggestion for a present, always tied to a specific Occasion.
- **Occasion**: An event or milestone that prompts gift-giving (birthday, wedding, etc.).
- **Recipient**: The person for whom the gift is intended.
- **Estimated Cost**: The approximate price range for a Gift Idea, expressed as Money.
- **Money**: An amount paired with a currency code. Never a bare number.
```

When a term changes — and it will — you rename it everywhere. In the code, in the
glossary, in conversation. Inconsistency here is a vector for bugs.

---

## 3. "Where Does This Code Belong?" Decision Framework

One of the most common questions in any non-trivial codebase is: *where does this logic
go?* DDD gives you a framework for answering that question based on **what the code
does**, not what file happens to be open in your editor.

| If the code...                        | It belongs in...           | Example                                      |
|---------------------------------------|----------------------------|----------------------------------------------|
| Enforces a business rule              | `domain/`                  | "An order must have at least one line item"   |
| Orchestrates steps without owning logic | Use case / application layer | "Create order, charge payment, send email"  |
| Formats data for display              | `lib/` or presentation layer | "Format Money as '£12.50'"                  |
| Talks to an external system           | Adapter / infrastructure   | "Save order to PostgreSQL"                   |
| Wires up framework concerns           | Delivery layer             | "Express route handler, Next.js API route"   |

### The Key Distinction: Domain vs. Presentation

A function that formats a `Money` value as a localised currency string is **pure**, but it
is **not domain logic**. It's presentation logic. The domain doesn't care how money
looks on screen — it cares about arithmetic, comparisons, and rules like "the total must
not exceed the budget."

Putting formatting in the domain layer is one of the most common mistakes. It muddies the
domain with concerns that change for UI reasons, not business reasons.

### The Key Distinction: Domain Service vs. Use Case

Both are "services" in the general sense, but they differ in what they know:

- A **domain service** contains business logic that spans multiple entities or value objects. It knows the rules. It lives in `domain/`.
- A **use case** (application service) orchestrates: call the domain, call the adapter, return a result. It doesn't know the rules — it delegates to domain objects and services.

We'll return to this distinction in section 8.

---

## 4. Value Objects

A value object is defined entirely by its attributes. It has no identity — two value
objects with the same attributes are considered equal. It is always immutable.

The classic example is `Money`. A ten-pound note in your pocket and a ten-pound note in
mine are interchangeable. We don't track which specific note; we care about the amount
and the currency.

### Bad: Primitives Everywhere

```typescript
function calculateTotal(prices: number[], currency: string): number {
  // What if someone passes prices in GBP and currency as "USD"?
  // What if a price is negative?
  // What unit is this? Pence? Pounds? We have no idea.
  return prices.reduce((sum, p) => sum + p, 0);
}
```

Primitive types carry no meaning and enforce no rules. A `number` can be negative,
fractional to 20 decimal places, or `NaN`. A `string` can be empty, contain SQL
injection, or be "banana". The type system is not helping you.

### Good: A Money Value Object

```typescript
type Currency = "GBP" | "USD" | "EUR";

type Money = {
  readonly amount: number; // in minor units (pence, cents)
  readonly currency: Currency;
};

function createMoney(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) {
    throw new Error(`Money amount must be an integer (minor units), got ${amount}`);
  }
  return Object.freeze({ amount, currency });
}

function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return createMoney(a.amount + b.amount, a.currency);
}

function moneyEquals(a: Money, b: Money): boolean {
  return a.amount === b.amount && a.currency === b.currency;
}
```

Note:
- The factory function `createMoney` validates on construction. You cannot create invalid `Money`.
- All operations return new values. Nothing is mutated.
- Equality is structural, not referential.

### Branded Types for Type-Safe Primitives

Sometimes a value object is just a constrained string or number. You still want the type
system to prevent you from passing a `UserId` where an `OrderId` is expected.

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
type EmailAddress = Brand<string, "EmailAddress">;

function createUserId(raw: string): UserId {
  if (!raw.trim()) {
    throw new Error("UserId cannot be empty");
  }
  return raw as UserId;
}

function createEmailAddress(raw: string): EmailAddress {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error(`Invalid email address: ${raw}`);
  }
  return raw as EmailAddress;
}

// Now the compiler catches this mistake:
function findOrder(orderId: OrderId): void { /* ... */ }

const userId = createUserId("user-123");
// findOrder(userId); // Compile error! UserId is not assignable to OrderId.
```

The `Brand` type trick uses TypeScript's structural type system against itself by adding a
phantom property that only exists at the type level. It's zero-cost at runtime.

### Validation Strategy: Zod at Boundaries, Factories Inside

Use **Zod schemas** (or similar) at trust boundaries — API endpoints, form submissions,
file reads — where you're parsing unknown external data into your domain types.

Inside the domain, use plain TypeScript types and factory functions. Your domain layer
should not depend on Zod. If you swap validation libraries, the domain shouldn't notice.

```typescript
// At the API boundary (delivery layer)
import { z } from "zod";

const CreateGiftIdeaRequestSchema = z.object({
  description: z.string().min(1).max(500),
  occasionId: z.string().uuid(),
  estimatedCostAmount: z.number().int().positive(),
  estimatedCostCurrency: z.enum(["GBP", "USD", "EUR"]),
});

// In the use case, after parsing:
function handleCreateGiftIdea(raw: unknown): CreateGiftIdeaResult {
  const parsed = CreateGiftIdeaRequestSchema.parse(raw);

  // Now build domain value objects using factories
  const cost = createMoney(parsed.estimatedCostAmount, parsed.estimatedCostCurrency);
  const occasionId = createOccasionId(parsed.occasionId);

  // Pass domain types into the domain layer
  return createGiftIdea(parsed.description, occasionId, cost);
}
```

---

## 5. Entities

An entity has **identity** — it persists across time and state changes. Two users with
the same name and email are still different users if they have different IDs. Unlike value
objects, entities are tracked individually.

### The Always-Valid Principle

An entity must be valid after construction and after every state transition. There is no
moment in its lifecycle where it exists in an invalid state. This is the single most
important rule for entities.

### Bad: An Entity You Can Break

```typescript
type User = {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  verifiedAt?: Date;
};

// Anyone can create a broken user:
const badUser: User = {
  id: "",
  email: "not-an-email",
  name: "",
  verified: true,
  verifiedAt: undefined, // Verified but no verification date? Invalid.
};
```

The type allows every invalid combination. The "validation" is some function that someone
might call, if they remember, if they feel like it.

### Good: Always-Valid Construction with Immutable Updates

```typescript
type UnverifiedUser = {
  readonly status: "unverified";
  readonly id: UserId;
  readonly email: EmailAddress;
  readonly name: string;
};

type VerifiedUser = {
  readonly status: "verified";
  readonly id: UserId;
  readonly email: EmailAddress;
  readonly name: string;
  readonly verifiedAt: Date;
};

type User = UnverifiedUser | VerifiedUser;

function createUser(id: UserId, email: EmailAddress, name: string): UnverifiedUser {
  if (name.trim().length === 0) {
    throw new Error("User name cannot be empty");
  }
  return Object.freeze({
    status: "unverified" as const,
    id,
    email,
    name: name.trim(),
  });
}

function verifyUser(user: UnverifiedUser, verifiedAt: Date): VerifiedUser {
  return Object.freeze({
    ...user,
    status: "verified" as const,
    verifiedAt,
  });
}
```

Notice:
- `createUser` only returns `UnverifiedUser`. A newly created user cannot be verified.
- `verifyUser` only accepts `UnverifiedUser`. You cannot verify an already-verified user. The compiler enforces this.
- Every transition returns a **new** object. The original is untouched.
- There is no possible way to have a verified user without a `verifiedAt` date. The type system makes it structurally impossible.

---

## 6. Making Illegal States Unrepresentable with Discriminated Unions

This is where TypeScript's type system becomes your most powerful modelling tool. The idea
is simple: **if a state combination is invalid, make it impossible to express in the type
system.**

### Bad: Boolean Flags and Optional Fields

```typescript
type Order = {
  id: string;
  items: OrderItem[];
  isPlaced: boolean;
  placedAt?: Date;
  isShipped: boolean;
  shippedAt?: Date;
  trackingNumber?: string;
  isCancelled: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
};
```

How many invalid states does this allow? An order that is simultaneously placed, shipped,
and cancelled. A shipped order with no tracking number. A cancelled order with no reason.
A placed order with no placement date. The booleans and optionals create a combinatorial
explosion of nonsense.

### Good: Discriminated Union States

```typescript
type DraftOrder = {
  readonly status: "draft";
  readonly id: OrderId;
  readonly items: readonly OrderItem[];
};

type PlacedOrder = {
  readonly status: "placed";
  readonly id: OrderId;
  readonly items: readonly OrderItem[];
  readonly placedAt: Date;
};

type ShippedOrder = {
  readonly status: "shipped";
  readonly id: OrderId;
  readonly items: readonly OrderItem[];
  readonly placedAt: Date;
  readonly shippedAt: Date;
  readonly trackingNumber: string;
};

type CancelledOrder = {
  readonly status: "cancelled";
  readonly id: OrderId;
  readonly items: readonly OrderItem[];
  readonly cancelledAt: Date;
  readonly reason: string;
};

type Order = DraftOrder | PlacedOrder | ShippedOrder | CancelledOrder;
```

Each variant carries **exactly** the data that is relevant to that state. A shipped order
always has a tracking number. A cancelled order always has a reason. There is no way to
create an invalid combination because the type literally does not have fields for data
that doesn't apply.

### State Transitions as Functions

```typescript
function placeOrder(order: DraftOrder): PlacedOrder {
  if (order.items.length === 0) {
    throw new Error("Cannot place an order with no items");
  }
  return Object.freeze({
    status: "placed" as const,
    id: order.id,
    items: order.items,
    placedAt: new Date(),
  });
}

function shipOrder(order: PlacedOrder, trackingNumber: string): ShippedOrder {
  if (!trackingNumber.trim()) {
    throw new Error("Tracking number is required for shipping");
  }
  return Object.freeze({
    status: "shipped" as const,
    id: order.id,
    items: order.items,
    placedAt: order.placedAt,
    shippedAt: new Date(),
    trackingNumber: trackingNumber.trim(),
  });
}

function cancelOrder(
  order: DraftOrder | PlacedOrder,
  reason: string,
): CancelledOrder {
  if (!reason.trim()) {
    throw new Error("Cancellation reason is required");
  }
  return Object.freeze({
    status: "cancelled" as const,
    id: order.id,
    items: order.items,
    cancelledAt: new Date(),
    reason: reason.trim(),
  });
}
```

Notice that `cancelOrder` accepts `DraftOrder | PlacedOrder` — you can cancel a draft or
a placed order, but not a shipped one. The type signature **is** the state machine
documentation.

### Exhaustive Handling with `never`

When you switch on a discriminated union, TypeScript can verify you've handled every case:

```typescript
function describeOrderStatus(order: Order): string {
  switch (order.status) {
    case "draft":
      return `Draft order with ${order.items.length} items`;
    case "placed":
      return `Placed on ${order.placedAt.toISOString()}`;
    case "shipped":
      return `Shipped — tracking: ${order.trackingNumber}`;
    case "cancelled":
      return `Cancelled: ${order.reason}`;
    default: {
      const _exhaustive: never = order;
      throw new Error(`Unhandled order status: ${_exhaustive}`);
    }
  }
}
```

If you add a new order status variant later (say `"returned"`), the compiler will
immediately flag every switch statement that doesn't handle it. This is compile-time
safety that scales with your team and your codebase.

---

## 7. Aggregates

An aggregate is a cluster of entities and value objects that are treated as a single unit
for data changes. It has a single **aggregate root** — the entity through which all
external access passes.

### Why Aggregates Exist

Without aggregates, any code can reach into any entity and modify it, potentially
violating business rules that span multiple objects. Aggregates draw a boundary: all
changes to this cluster go through the root, and the root enforces the invariants.

### Rules of Thumb

1. **One aggregate root per transaction.** If you're modifying two aggregates in one
   transaction, you've probably drawn the boundary wrong, or you need a domain event.

2. **Reference other aggregates by ID, never by embedding.** If an `Order` needs to know
   about a `Customer`, it holds a `CustomerId`, not a `Customer` object. This keeps
   aggregates independent and prevents them from growing into god objects.

3. **Keep aggregates small.** A common mistake is making aggregates too large. An `Order`
   aggregate contains its `OrderItems` because an item can't exist without its order and
   the order enforces rules across items (e.g., maximum item count). But the `Order`
   does not contain the `Customer` or the `Product` — those are separate aggregates
   referenced by ID.

### Example: Order as an Aggregate Root

```typescript
type OrderAggregate = {
  readonly order: DraftOrder | PlacedOrder;
  // OrderItems are inside the aggregate boundary
};

function addItemToOrder(
  aggregate: OrderAggregate & { order: DraftOrder },
  item: OrderItem,
): OrderAggregate {
  const maxItems = 50;
  if (aggregate.order.items.length >= maxItems) {
    throw new Error(`Cannot exceed ${maxItems} items per order`);
  }

  const isDuplicate = aggregate.order.items.some(
    (existing) => existing.productId === item.productId,
  );
  if (isDuplicate) {
    throw new Error("Product already in order — update quantity instead");
  }

  return {
    order: {
      ...aggregate.order,
      items: [...aggregate.order.items, item],
    },
  };
}
```

The aggregate root (the order) enforces the invariant: no more than 50 items, no
duplicate products. External code cannot add items to the internal list directly — it
must go through `addItemToOrder`, which guards the rules.

### What Stays Outside the Aggregate

The `Customer` who placed the order is a separate aggregate. The `Product` each item
refers to is a separate aggregate. The order holds `CustomerId` and `ProductId`
references. When the use case needs full customer data alongside an order, it fetches
both aggregates independently and composes them — the domain layer doesn't do this
joining.

---

## 8. Domain Services

Sometimes business logic doesn't naturally belong to any single entity or value object.
When logic operates across multiple aggregates or requires information that no single
entity owns, it belongs in a **domain service**.

### Bad: Cramming Cross-Entity Logic into One Entity

```typescript
// Don't do this — Order shouldn't know about inventory
function placeOrderWithInventoryCheck(
  order: DraftOrder,
  inventoryLevels: Map<ProductId, number>,
): PlacedOrder {
  for (const item of order.items) {
    const available = inventoryLevels.get(item.productId) ?? 0;
    if (item.quantity > available) {
      throw new Error(`Insufficient stock for ${item.productId}`);
    }
  }
  return placeOrder(order);
}
```

This forces the `Order` domain to know about inventory concepts. The `Order` aggregate's
job is to manage its own items and invariants, not to understand stock levels.

### Good: A Stateless Domain Service

```typescript
// domain/services/orderPlacementService.ts

type InventoryCheck = (productId: ProductId, quantity: number) => boolean;

type PlaceOrderResult =
  | { outcome: "placed"; order: PlacedOrder }
  | { outcome: "insufficient_stock"; unavailableItems: ProductId[] };

function checkAndPlaceOrder(
  order: DraftOrder,
  isInStock: InventoryCheck,
): PlaceOrderResult {
  const unavailableItems = order.items
    .filter((item) => !isInStock(item.productId, item.quantity))
    .map((item) => item.productId);

  if (unavailableItems.length > 0) {
    return { outcome: "insufficient_stock", unavailableItems };
  }

  return { outcome: "placed", order: placeOrder(order) };
}
```

The domain service:
- Is **stateless** — it doesn't hold data between calls.
- Expresses a **business rule** — "you can't place an order for out-of-stock items."
- Takes its dependencies as arguments (the `InventoryCheck` function), keeping it testable and decoupled from infrastructure.
- Lives in `domain/`, because this is business logic.

### Domain Service vs. Use Case

This distinction trips people up, so here it is starkly:

| Aspect              | Domain Service                          | Use Case (Application Service)           |
|---------------------|-----------------------------------------|------------------------------------------|
| Contains            | Business logic and rules                | Orchestration and coordination           |
| Knows about         | Domain types, other domain services     | Domain layer, adapters, infrastructure   |
| Example             | "Can this order be placed given stock?" | "Load order, check stock, save, notify"  |
| Lives in            | `domain/`                               | `useCases/` or `application/`            |
| Depends on          | Domain types only                       | Domain + ports/adapters                  |

A use case calls a domain service. A domain service never calls a use case.

```typescript
// useCases/placeOrder.ts — this is orchestration, not business logic

async function placeOrderUseCase(
  orderId: OrderId,
  orderRepo: OrderRepository,
  inventoryAdapter: InventoryAdapter,
  notificationService: NotificationPort,
): Promise<PlaceOrderResult> {
  const order = await orderRepo.findById(orderId);
  if (!order || order.order.status !== "draft") {
    return { outcome: "not_found" as const };
  }

  const isInStock = (productId: ProductId, qty: number) =>
    inventoryAdapter.checkAvailability(productId, qty);

  const result = checkAndPlaceOrder(order.order, isInStock);

  if (result.outcome === "placed") {
    await orderRepo.save({ order: result.order });
    await notificationService.sendOrderConfirmation(result.order);
  }

  return result;
}
```

The use case knows **what** steps to take. The domain service knows **what rules** apply.
Neither knows how the database works or what the notification system is.

---

## 9. Error Modelling

Not all failures are the same. DDD asks you to be precise about which failures are
**expected business outcomes** and which are **unexpected infrastructure or programmer
errors**.

### The Litmus Test

> "Could a reasonable user's legitimate action cause this outcome?"

- "The email address is already taken." **Yes** — result type.
- "The order cannot be placed because items are out of stock." **Yes** — result type.
- "The database connection timed out." **No** — exception.
- "Cannot read property 'id' of undefined." **No** — exception (programmer mistake).

### Bad: Throwing for Expected Business Outcomes

```typescript
function registerUser(email: string, name: string): User {
  if (emailAlreadyExists(email)) {
    throw new Error("Email already taken"); // Caught where? Handled how?
  }
  // ...
}
```

The caller has to catch a generic `Error` and inspect the message string to know what
happened. This is fragile, untyped, and easy to miss.

### Good: Discriminated Union Result Types

```typescript
type RegisterUserResult =
  | { outcome: "registered"; user: VerifiedUser }
  | { outcome: "email_taken"; email: EmailAddress }
  | { outcome: "invalid_name"; reason: string };

function registerUser(
  email: EmailAddress,
  name: string,
): RegisterUserResult {
  if (emailAlreadyExists(email)) {
    return { outcome: "email_taken", email };
  }

  if (name.trim().length < 2) {
    return { outcome: "invalid_name", reason: "Name must be at least 2 characters" };
  }

  const user = createUser(createUserId(generateId()), email, name);
  const verified = verifyUser(user, new Date());
  return { outcome: "registered", user: verified };
}
```

The caller **must** handle every outcome — the type system ensures it:

```typescript
const result = registerUser(email, name);

switch (result.outcome) {
  case "registered":
    console.log(`Welcome, ${result.user.name}`);
    break;
  case "email_taken":
    console.log(`${result.email} is already registered`);
    break;
  case "invalid_name":
    console.log(result.reason);
    break;
  default: {
    const _exhaustive: never = result;
    throw new Error(`Unhandled outcome: ${_exhaustive}`);
  }
}
```

### When to Throw

Reserve `throw` for situations that indicate a bug or an infrastructure failure:

```typescript
// Programmer mistake — this should never happen if the code is correct
function unwrapOrderId(id: OrderId | null): OrderId {
  if (id === null) {
    throw new Error("OrderId was null — this indicates a bug in the calling code");
  }
  return id;
}

// Infrastructure failure — the caller can't do anything domain-specific about this
async function loadOrder(id: OrderId): Promise<Order> {
  try {
    return await db.query("SELECT ...", [id]);
  } catch (err) {
    throw new Error(`Failed to load order ${id}: ${err}`);
  }
}
```

The boundary between "result type" and "exception" isn't always razor-sharp, but the
litmus test gets you to the right answer most of the time. When in doubt, ask: "Does the
user need feedback about this, or does an engineer need a stack trace?"

---

## 10. Domain Models Evolve

Your first domain model will be wrong. Not catastrophically wrong — just incomplete, or
slightly misaligned with how the domain experts actually think. This is normal and
expected.

### The Model is a Living Thing

When you learn that what you called a "Recipient" is actually two concepts — "Recipient"
(the person) and "Delivery Address" (the place) — you split the type. When two concepts
you modelled separately turn out to always travel together, you merge them.

This isn't refactoring for refactoring's sake. It's keeping the code aligned with the
team's evolving understanding of the domain.

### TDD Makes Evolution Safe

If you have thorough tests around your domain types and transitions, renaming a type from
`Recipient` to `GiftRecipient` is a 10-minute find-and-replace-plus-compile-check
exercise, not a week-long terror. Tests give you the confidence to keep the model honest.

### Practical Advice

- **Rename aggressively.** A poorly named type accumulates misunderstandings like debt
  accumulates interest. Rename the moment you realise the name is wrong.
- **Don't version domain types for backward compatibility within the same bounded context.**
  Adapters at the boundary handle serialisation differences. Inside the domain, the
  current model is the only model.
- **Have regular "model review" conversations with domain experts.** Show them the type
  definitions (not the implementation). If they squint and say "well, sort of, but we
  actually call that a..." — rename it.

---

## 11. Anti-Patterns

These are the traps that catch well-intentioned teams. Knowing them helps you spot the
drift early.

### The Anemic Domain Model

Your domain types are plain data bags with no behaviour. All logic lives in "services"
that manipulate them from the outside. The types don't protect their own invariants.

```typescript
// Anemic — the type is just a bag of data
type Account = {
  balance: number;
  currency: string;
  isActive: boolean;
};

// All logic is external
function withdraw(account: Account, amount: number): Account {
  // Who calls this? Is it the only place that modifies balance?
  // What stops someone from writing account.balance -= 1000 directly?
  if (amount > account.balance) throw new Error("Insufficient funds");
  return { ...account, balance: account.balance - amount };
}
```

The fix is to make the type enforce its own rules through construction and transitions.
Use `readonly` fields and factory/transition functions that return new instances. Make it
so the only way to get an `Account` with a different balance is through `withdraw`.

### Generic Technical Names

`DataProcessor`, `ItemHandler`, `ServiceManager`, `EntityHelper`. These names tell you
nothing about the domain. If the name would make sense in any codebase, it's not specific
enough for yours.

### Presentation Logic in the Domain

```typescript
// This does NOT belong in domain/
function formatOrderSummary(order: PlacedOrder): string {
  return `Order #${order.id} placed at ${order.placedAt.toLocaleDateString()}`;
}
```

This function depends on locale, display format, and UI conventions. It belongs in the
presentation layer. The domain should expose the data; the presentation layer decides how
to render it.

### Over-Engineering: Aggregates for Simple CRUD

If your "aggregate" is a single entity with no invariants spanning multiple objects, you
don't have an aggregate — you have an entity with extra ceremony. Not every entity needs
an aggregate wrapper. Not every project needs domain events. Not every bounded context
needs its own deployment.

Apply the patterns when they solve a real problem, not because the book says to.

---

## Summary Checklist

Use this as a quick reference when making design decisions:

### Language and Naming

- [ ] Every type, function, and variable uses terms from the domain glossary
- [ ] The team maintains a living glossary that domain experts recognise
- [ ] Renaming happens immediately when the understanding of a term changes

### Value Objects

- [ ] Immutable, compared by attributes, no identity
- [ ] Created through factory functions that validate on construction
- [ ] Branded types used for type-safe primitive wrappers (`UserId`, `EmailAddress`)
- [ ] Zod schemas at trust boundaries; plain types + factories inside the domain

### Entities

- [ ] Always valid after construction and every state transition
- [ ] Immutable updates — transitions return new objects
- [ ] Identity tracked by a typed ID, not a raw string

### Discriminated Unions

- [ ] Illegal states are unrepresentable — no boolean flags with correlated optional fields
- [ ] Entity lifecycles modelled as unions of status-specific types
- [ ] All `switch` statements are exhaustive using the `never` trick

### Aggregates

- [ ] One aggregate root per transaction boundary
- [ ] Other aggregates referenced by ID, never embedded
- [ ] Aggregates kept as small as possible — only entities that share invariants

### Domain Services

- [ ] Stateless functions for cross-entity business logic
- [ ] Live in `domain/`, depend only on domain types
- [ ] Clearly distinct from use cases (orchestration)

### Error Modelling

- [ ] Expected business outcomes use discriminated union result types
- [ ] Exceptions reserved for programmer mistakes and infrastructure failures
- [ ] The litmus test applied: "Could a user's action legitimately cause this?"

### Evolution

- [ ] The model is updated as domain understanding deepens
- [ ] TDD provides safety for renaming and restructuring
- [ ] Regular model review conversations with domain experts

### Code Placement

- [ ] Business rules live in `domain/`
- [ ] Orchestration lives in use cases
- [ ] Formatting and display live in `lib/` or presentation layer
- [ ] External system communication lives in adapters
- [ ] Framework wiring lives in the delivery layer

### Avoid

- [ ] Anemic domain models — types must enforce their own invariants
- [ ] Generic technical names — every name should be domain-specific
- [ ] Presentation logic in the domain layer
- [ ] Premature aggregate/event/CQRS complexity for simple CRUD
