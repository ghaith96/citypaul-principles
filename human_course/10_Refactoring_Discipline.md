# Chapter 10: Refactoring Discipline — Improving Without Breaking

> *"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."* — Martin Fowler

---

## The Mental Model: Refactoring Is Controlled Improvement

Refactoring is not rewriting. It is not cleanup. It is not the part of the sprint where you "pay down tech debt" in some vague, unstructured way. Refactoring is the disciplined practice of changing the internal structure of code without altering its external behavior.

That last part is the whole game. If behavior changes, it is not refactoring — it is a feature or a bug, and it belongs in a different commit with a different test.

In TDD, refactoring occupies the third step of the RED-GREEN-REFACTOR cycle. You have written a failing test (RED), you have made it pass with the simplest possible code (GREEN), and now you look at what you have and decide: *does the structure of this code deserve improvement?*

The key word is "decide." Refactoring is not automatic. It is not mandatory after every GREEN. It is a judgment call made by an engineer who has just proven the behavior works and is now free to improve the shape of the solution without risk. Sometimes the code is already clean. Sometimes the improvement is not worth the effort at this stage. The discipline is in making that assessment honestly.

---

## 1. Refactoring Is the Third Step, Not an Afterthought

Many teams treat refactoring as something you do during a "hardening sprint" or when a tech lead gets frustrated enough to file a ticket. This is backwards. In TDD, refactoring is woven into every cycle. You do it while the context is still in your head, while the tests are green, and while the cost of change is lowest.

But "third step" does not mean "always do something." It means "always pause and assess." Ask yourself:

- Is there duplication that represents the same business concept?
- Are there names that would confuse someone reading this for the first time?
- Is the nesting deep enough to obscure intent?
- Is the function doing more than one thing?

If the answer to all of these is no, move on. Write the next failing test. The worst refactoring is one done out of habit rather than judgment.

---

## 2. The Safety Net: Commit Before Refactoring

Here is a workflow that will save you hours of frustration:

**GREEN → COMMIT → REFACTOR → COMMIT**

When your tests go green, commit immediately. This creates a checkpoint — a known-good state you can return to if your refactoring goes sideways. Then refactor. When the refactoring is complete and all tests still pass, commit again.

This sounds overly cautious until the first time you spend twenty minutes on a refactoring that tangles everything up, your tests fail in ways you do not understand, and you realize you cannot cleanly undo what you did. With the commit checkpoint, you run `git checkout .` and you are back to working code in seconds.

The commit-before-refactoring pattern gives you something invaluable: **freedom to experiment**. You can try an aggressive extraction, see if it reads better, and throw it away if it does not. You can attempt a different data structure, realize it does not fit, and revert. The safety net makes you bolder, not more timid.

```
# The workflow in practice
git add -A && git commit -m "feat: add order total calculation"

# Now refactor with confidence
# ... make structural changes ...

# Tests still green?
npm test

# Yes — commit the refactoring
git add -A && git commit -m "refactor: extract tax calculation into pure function"

# Tests broke? Revert and try a different approach
git checkout .
```

---

## 3. The Priority Classification System

Not all code smells are equal. When you pause at the refactoring step, you need a way to triage what actually matters. Here is a classification that works well in practice.

### Critical — Fix Now, Before Moving On

These are structural problems that will compound if left in place:

- **Mutations**: mutable state where immutability is possible. These are bug factories.
- **Knowledge duplication**: the same business rule expressed in two places. When one changes and the other does not, you have a defect.
- **Deep nesting**: more than three levels of indentation. This is a readability emergency.

### High — Fix This Session

These matter, but you can finish your current RED-GREEN-REFACTOR cycle first:

- **Magic numbers and strings**: `if (status === 3)` instead of `if (status === OrderStatus.Shipped)`
- **Unclear names**: `data`, `result`, `temp`, `processStuff`
- **Long functions**: anything over roughly 30 lines is doing too much

### Nice — Fix Later

These are real improvements that do not justify interrupting your current work:

- Minor naming improvements where the current name is acceptable but not ideal
- Extracting a single-use helper that would marginally improve readability
- Reordering functions within a file

### Skip — Do Not Touch

- Code that is already clear and correct
- Code in a module you are not currently working on
- Stylistic preferences that have no impact on clarity

### Example Assessment

Consider this function after making a test go green:

```typescript
// Just passed GREEN — now assess
function processOrder(order: Order): OrderResult {
  let total = 0;
  for (const item of order.items) {
    if (item.quantity > 0) {
      if (item.discount > 0) {
        total += item.price * item.quantity * (1 - item.discount);
      } else {
        total += item.price * item.quantity;
      }
    }
  }
  if (total > 100) {
    total = total * 0.95;
  }
  if (total > 500) {
    total = total * 0.9;
  }
  return { total, status: "pending" };
}
```

Your assessment:

| Smell | Classification | Action |
|---|---|---|
| `let total` — mutation | Critical | Reduce to `items.reduce(...)` or extract calculation |
| Nested if/else 3 levels deep | Critical | Flatten with early filtering |
| Magic numbers `100`, `500`, `0.95`, `0.9` | High | Extract to named constants |
| `"pending"` string literal | High | Use an enum or const |
| Function does calculation + discount logic | High | Separate concerns |

After refactoring:

```typescript
const BULK_DISCOUNT_THRESHOLD = 100;
const BULK_DISCOUNT_RATE = 0.95;
const PREMIUM_DISCOUNT_THRESHOLD = 500;
const PREMIUM_DISCOUNT_RATE = 0.9;

function calculateItemTotal(item: OrderItem): number {
  const discount = item.discount > 0 ? 1 - item.discount : 1;
  return item.price * item.quantity * discount;
}

function applyBulkDiscounts(total: number): number {
  if (total > PREMIUM_DISCOUNT_THRESHOLD) {
    return total * PREMIUM_DISCOUNT_RATE;
  }
  if (total > BULK_DISCOUNT_THRESHOLD) {
    return total * BULK_DISCOUNT_RATE;
  }
  return total;
}

function processOrder(order: Order): OrderResult {
  const validItems = order.items.filter((item) => item.quantity > 0);
  const subtotal = validItems.reduce(
    (sum, item) => sum + calculateItemTotal(item),
    0
  );
  const total = applyBulkDiscounts(subtotal);

  return { total, status: OrderStatus.Pending };
}
```

Same behavior. Same passing tests. Dramatically better structure. And because you committed before refactoring, the experiment was risk-free.

---

## 4. DRY = Knowledge, Not Code

This is the most misunderstood principle in software engineering. DRY — Don't Repeat Yourself — does not mean "never have two lines of code that look similar." It means **every piece of business knowledge should have a single, authoritative representation in your system**.

The distinction matters enormously.

### Abstract When

Two pieces of code represent the **same business concept** and would **change together** if requirements changed:

```typescript
// Good: same validation rule used by multiple endpoints
function validateOrderQuantity(quantity: number): ValidationResult {
  if (quantity <= 0) {
    return { valid: false, error: "Quantity must be positive" };
  }
  if (quantity > MAX_ORDER_QUANTITY) {
    return { valid: false, error: `Quantity cannot exceed ${MAX_ORDER_QUANTITY}` };
  }
  return { valid: true };
}

// Used in createOrder handler
const quantityCheck = validateOrderQuantity(input.quantity);
// Used in updateOrder handler
const quantityCheck = validateOrderQuantity(input.newQuantity);
```

This is correct DRY. The business rule "order quantity must be between 1 and MAX" lives in one place. If the rule changes, you change it once.

### Keep Separate When

Two pieces of code look similar but represent **different business concepts** that will **evolve independently**:

```typescript
// Bad: forced abstraction of two different concepts
function formatEntity(entity: User | Product, type: "user" | "product"): string {
  if (type === "user") {
    return `${entity.name} (${(entity as User).email})`;
  }
  return `${entity.name} - $${(entity as Product).price}`;
}

// Good: two simple functions for two different concepts
function formatUserDisplay(user: User): string {
  return `${user.name} (${user.email})`;
}

function formatProductDisplay(product: Product): string {
  return `${product.name} - $${product.price}`;
}
```

The bad version exists because someone saw `entity.name` appear twice and felt the urge to abstract. But user display formatting and product display formatting are different business concerns. When the product team asks you to add a stock indicator to the product display, you should not have to navigate a shared function that also handles users.

**Three similar lines of code is better than a premature abstraction.** An abstraction that does not represent a real, shared business concept creates coupling where none should exist. It makes every future change harder, because you have to reason about all callers instead of just the one in front of you.

---

## 5. Speculative Code Is a TDD Violation

If no test demands a line of code, that line should not exist. This is not a suggestion — it is the logical conclusion of TDD's core premise.

Speculative code takes many forms:

- "Just in case" guard clauses with no test exercising the path
- Features for requirements that have not been written yet
- Abstractions built for "future flexibility"
- Parameters accepted but never used by any caller
- Error handling for conditions no test reproduces

```typescript
// Bad: no test exercises the empty cart path
function calculateCartTotal(items: CartItem[]): number {
  if (items.length === 0) {
    throw new Error("Cart cannot be empty");
  }

  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

If you run mutation testing against this code and no test fails when the guard clause is removed, you have dead logic. It looks responsible. It feels like good defensive programming. But in TDD, untested code is untrustworthy code — you have no proof it works correctly, and you have no protection against someone changing it silently.

The correct approach:

```typescript
// Good: the test comes first
describe("calculateCartTotal", () => {
  it("should reject an empty cart", () => {
    expect(() => calculateCartTotal([])).toThrow("Cart cannot be empty");
  });

  it("should sum item totals", () => {
    const items = [
      { price: 10, quantity: 2 },
      { price: 5, quantity: 3 },
    ];
    expect(calculateCartTotal(items)).toBe(35);
  });
});

// Now the guard clause is justified — a test demands it
function calculateCartTotal(items: CartItem[]): number {
  if (items.length === 0) {
    throw new Error("Cart cannot be empty");
  }

  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

The difference is not in the production code — it is identical. The difference is in the process. With the test-first approach, the guard clause is proven behavior. Without it, the guard clause is a guess that might be wrong and will certainly never be verified.

When you find speculative code during refactoring, you have two options:

1. **Write a failing test that justifies it**, then the code stays.
2. **Delete it.** If the behavior is needed later, a failing test will tell you.

---

## 6. Do Not Extract Purely for Testability

This is a common trap, especially in codebases that prize unit test coverage metrics. The reasoning goes: "This logic is inside a larger function, and I cannot test it in isolation, so I should extract it into its own module."

If the **only** reason to extract is testability, do not do it.

```typescript
// Bad: extracted solely to unit test the formatting logic
// formatHelpers.ts
export function formatLineItem(item: InvoiceItem): string {
  return `${item.name}: ${item.quantity} x $${item.unitPrice.toFixed(2)}`;
}

// invoice.ts
import { formatLineItem } from "./formatHelpers";

export function generateInvoice(order: Order): Invoice {
  const lines = order.items.map(formatLineItem);
  // ... rest of invoice generation
}
```

```typescript
// Good: inline, tested through the function that uses it
export function generateInvoice(order: Order): Invoice {
  const lines = order.items.map(
    (item) => `${item.name}: ${item.quantity} x $${item.unitPrice.toFixed(2)}`
  );
  // ... rest of invoice generation
}
```

The behavioral tests for `generateInvoice` already verify that line items are formatted correctly. If they do not, fix the tests — do not restructure the code.

Extract for legitimate reasons:

- **Readability**: the function is too long and extracting improves comprehension
- **DRY**: the same business logic is used in multiple places
- **Separation of concerns**: the extracted logic genuinely belongs to a different domain concept

Never extract because a coverage tool told you to.

---

## 7. When NOT to Refactor

Knowing when to refactor is important. Knowing when **not** to is equally important.

**The code works correctly and is clear enough.** "Clear enough" does not mean perfect. It means a competent engineer can read it and understand the intent without asking you questions. If you are refactoring code that was already readable, you are polishing, not improving.

**No test demands the change.** If your refactoring would require writing new tests or modifying existing ones, you are not refactoring — you are changing behavior. Stop, back up, and approach this as a new RED-GREEN-REFACTOR cycle.

**The change would alter behavior.** Renaming a public API method is not refactoring. Changing the error message format is not refactoring. Reordering the evaluation of conditions that have side effects is not refactoring. If external behavior changes, you need a test to specify the new behavior first.

**Premature optimization.** "This could be faster with a Map instead of a filter" is not a refactoring concern unless you have measured a performance problem. Write clean, correct code. Optimize when profiling tells you to.

**The code is "good enough" for the current phase.** If you are building a prototype or exploring a design, perfectionism in code structure is a waste. You will likely throw half of it away. Refactor when the design stabilizes, not while it is still taking shape.

---

## 8. Refactoring Commit Messages

Refactoring commits should never be mixed with feature commits. This is not pedantry — it serves a practical purpose. When something breaks in production and you bisect the commit history, you need to know immediately whether a commit changed behavior or only changed structure. Mixed commits make that impossible.

Use the `refactor:` prefix consistently:

```
refactor: extract tax calculation into pure function
refactor: simplify error handling in order service
refactor: rename OrderData to OrderSnapshot for clarity
refactor: flatten nested conditionals in validation logic
refactor: replace magic numbers with named constants
```

Bad commit messages:

```
# Mixes behavior change with refactoring
refactor: extract validation and add email format check

# Too vague
refactor: cleanup

# Not actually refactoring
refactor: fix bug in discount calculation
```

A clean commit history where refactoring is visibly separate from feature work gives your team confidence. Anyone can revert a `refactor:` commit knowing that behavior is preserved — the tests will confirm it.

---

## Summary Checklist

Use this as a quick reference during the REFACTOR step of your TDD cycle.

- [ ] **Tests are green.** Never refactor against failing tests.
- [ ] **Committed the green state.** You have a safety net to revert to.
- [ ] **Assessed priority.** Not all smells need fixing now. Use Critical / High / Nice / Skip.
- [ ] **DRY applies to knowledge, not syntax.** Only abstract when two pieces of code represent the same business concept that would change together.
- [ ] **No speculative code.** Every line of production code is justified by a test. If no test demands it, delete it or write the test first.
- [ ] **Not extracting for testability alone.** Extract for readability, DRY, or separation of concerns.
- [ ] **Behavior is unchanged.** If the refactoring changes what the code does, stop — that is a feature, and it needs its own RED-GREEN-REFACTOR cycle.
- [ ] **Committed the refactoring separately.** `refactor:` prefix, no mixed concerns.
- [ ] **Tests are still green.** Run the full suite after refactoring, not just the test you were working on.
- [ ] **Moved on.** The refactoring is done. Do not polish endlessly. Write the next failing test.
