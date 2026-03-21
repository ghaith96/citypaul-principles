# Chapter 1: Strict TDD -- The Non-Negotiable Practice

> *"TDD is not about testing. It is about design. The tests are a side effect."*

---

## Why This Chapter Comes First

Every chapter that follows in this course -- immutability, strict typing, hexagonal architecture, domain-driven design -- rests on TDD. Not because it is the most important practice in isolation, but because it is the practice that forces you to think before you type. It changes the order in which your brain engages with a problem, and that changes everything.

Most engineers learn TDD as a rule: *write tests first*. They do it for a while, find it slow, and quietly drop back to writing code and adding tests after. This chapter exists to explain why that happens and why TDD, done properly, is not slower -- it is a fundamentally different way of designing software.

---

## 1. The Mental Model: TDD Is Design, Not Verification

Here is the shift you need to make: **TDD is not a testing technique. It is a design technique whose byproduct is a comprehensive test suite.**

When you write a test before the implementation exists, you are forced to answer questions that most engineers skip:

- What is the public interface of this thing?
- What inputs does it accept?
- What does the caller care about in the output?
- What should happen when things go wrong?

You answer these questions *before* you write a single line of production code. That means your interface is designed from the consumer's perspective, not the implementer's convenience. This is the entire point.

When you write code first and tests second, the tests inevitably describe the shape of your implementation. They test *how* the code works. TDD tests describe *what* the code does -- its behavior. That distinction is not academic. It determines whether your tests survive refactoring or shatter the moment you reorganize a file.

---

## 2. The RED-GREEN-REFACTOR Cycle

TDD operates in a tight loop with three phases. Every phase has a specific purpose, and skipping or blending phases defeats the discipline.

### RED: Write a Failing Test

Write a test that describes a behavior you want. Run it. Watch it fail.

This is not a formality. The failing test serves three purposes:

1. **It proves the test can fail.** A test that never fails is worthless. You need to see the red before you trust the green.
2. **It defines the interface.** The test is the first consumer of your code. It tells you what the API should look like.
3. **It sets the scope.** You know exactly what you are building next -- nothing more, nothing less.

The test should fail *for the right reason*. If you expect a function to return `false` for invalid input and the test fails because the function does not exist yet, that is the right reason. If it fails because of a syntax error in your test, fix the test first.

```typescript
// RED: This test describes the behavior we want
describe('validateEmail', () => {
  it('should reject emails without an @ symbol', () => {
    const result = validateEmail('invalid-email');

    expect(result).toEqual({
      valid: false,
      error: 'Email must contain @ symbol',
    });
  });
});
```

At this point, `validateEmail` does not exist. The test fails. Good.

### GREEN: Write the Minimum Code to Pass

Now write the **simplest, most direct** code that makes the test pass. Not the "right" code. Not the "clean" code. The minimum code.

```typescript
// GREEN: The minimum implementation that satisfies the test
const validateEmail = (email: string): ValidationResult => {
  if (!email.includes('@')) {
    return { valid: false, error: 'Email must contain @ symbol' };
  }
  return { valid: true };
};
```

This is the step where engineers fight the process. You can *see* that this function needs to handle empty strings, check for valid domains, reject multiple `@` symbols. Resist. Every one of those behaviors gets its own failing test first. If you add logic that no test demanded, you have violated TDD.

Why? Because untested code is unspecified behavior. It might be wrong. It might be unnecessary. And nobody -- including you in three months -- will know whether it is load-bearing or dead weight.

### REFACTOR: Improve the Structure (Only If It Adds Value)

After the test passes, take a breath and look at the code. Ask:

- Is anything unclear?
- Is there duplication of knowledge (not just code)?
- Are there magic values that should be named?

If the answer is "it is fine," move on. Not every green phase needs a refactor. The key discipline is that you **assess** after every green, but you only **act** if it genuinely improves the code.

When you do refactor:

1. Commit the passing code first (your safety net)
2. Make structural changes without altering behavior
3. Run the tests -- they must still pass
4. Commit the refactored code separately

```typescript
// REFACTOR: Extract a type and add clarity (only if this helps)
type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: string };

const validateEmail = (email: string): ValidationResult => {
  if (!email.includes('@')) {
    return { valid: false, error: 'Email must contain @ symbol' };
  }
  return { valid: true };
};
```

---

## 3. The Commit Cadence

Your git history is a record of how the code evolved. When you follow TDD, it tells a story.

### The Ideal Progression

```
commit a1b2c3d: test: add failing test for email validation without @ symbol
commit e4f5a6b: feat: implement email validation for missing @ symbol
commit c7d8e9f: test: add failing test for empty email string
commit 1a2b3c4: feat: reject empty email strings
commit 5d6e7f8: refactor: extract ValidationResult type for clarity
```

Each commit is small. Each commit leaves the codebase in a working state (except the `test:` commits, which have a failing test by design). Anyone reading this history can reconstruct your thought process.

### The Rule: Commit After GREEN, Before REFACTOR

This is your safety net. If a refactoring goes sideways, you can revert to the last green commit without losing any behavior. The workflow is:

1. Write failing test -- do not commit yet
2. Make it pass -- **commit** (`feat:` or `fix:`)
3. Refactor -- **commit** (`refactor:`)

Some teams prefer to commit the failing test separately (a `test:` commit before the `feat:` commit). This makes the RED-GREEN-REFACTOR phases visible in the history. Either convention works -- the non-negotiable part is committing after green and before refactoring.

### When the Linear Story Breaks

Real work is messy. Multi-session features, context switches, and collaborative work can disrupt the clean RED-GREEN-REFACTOR commit trail. When this happens, document it in your PR:

```markdown
## TDD Evidence

RED phase: commit c925187 (added failing tests for shopping cart)
GREEN phase: commits 5e0055b, 9a246d0 (implementation across two sessions)
REFACTOR: commit 11dbd1a (test isolation improvements)

Test Evidence:
- 12/12 tests passing
- 100% coverage verified
```

The exception is for the *evidence presentation*, not the *practice*. You still follow TDD in each session. You just acknowledge that the commit history does not perfectly mirror the process.

---

## 4. Why "I'll Add Tests Later" Is a Lie

Every engineer has said it. Every engineer who has said it knows, on some level, that it is not true. Here is why.

When you write code first, you make dozens of micro-decisions about structure, naming, and data flow. These decisions become the implementation. When you then sit down to write tests, your brain does not test the *behavior* -- it tests the *implementation you just wrote*. You end up with tests like this:

```typescript
// BAD: Tests written after implementation -- they mirror the code structure
describe('UserService', () => {
  it('should call validateUser', () => {
    const spy = vi.spyOn(validator, 'validateUser');
    userService.createUser(userData);
    expect(spy).toHaveBeenCalledWith(userData);
  });

  it('should call userRepository.save', () => {
    const spy = vi.spyOn(userRepository, 'save');
    userService.createUser(userData);
    expect(spy).toHaveBeenCalled();
  });

  it('should return the saved user', () => {
    const mockUser = { id: '123', ...userData };
    vi.spyOn(userRepository, 'save').mockReturnValue(mockUser);
    const result = userService.createUser(userData);
    expect(result).toEqual(mockUser);
  });
});
```

These tests are a mirror of the implementation. They test *how* the code works (it calls a validator, then calls save, then returns the result). If you refactor `UserService` to inline the validation logic, every test breaks -- even though the behavior has not changed.

Now compare TDD tests that describe behavior:

```typescript
// GOOD: Tests written first -- they describe behavior the caller cares about
describe('creating a user', () => {
  it('should create a user with valid data', () => {
    const result = createUser({
      name: 'Alice',
      email: 'alice@example.com',
    });

    expect(result.success).toBe(true);
    expect(result.user.name).toBe('Alice');
    expect(result.user.id).toBeDefined();
  });

  it('should reject a user with an empty name', () => {
    const result = createUser({
      name: '',
      email: 'alice@example.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Name is required');
  });

  it('should reject a user with an invalid email', () => {
    const result = createUser({
      name: 'Alice',
      email: 'not-an-email',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid email');
  });
});
```

These tests do not care whether validation happens in a separate class, an inline function, or a third-party library. They describe what the system does. They survive refactoring. They serve as documentation.

You cannot write tests like this after the fact. Your brain will not let you. It has already seen the implementation, and it will test *that*.

---

## 5. Speculative Code Is a TDD Violation

This is the rule that separates disciplined TDD from "we write tests":

**If no test demands a line of code, that line should not exist.**

Speculative code takes many forms:

- "Just in case" error handling for conditions no test exercises
- Configurable parameters nobody has asked for
- Abstract base classes for "future flexibility"
- Defensive null checks that no caller can trigger

All of these feel responsible. All of them are violations.

```typescript
// BAD: Speculative code -- no test demands any of this
const processOrder = (order: Order): ProcessedOrder => {
  // "Just in case" the order is null (no test for this)
  if (!order) {
    throw new Error('Order is required');
  }

  // Configurable tax rate "for future flexibility" (no test for this)
  const taxRate = order.region?.taxRate ?? DEFAULT_TAX_RATE;

  // Logging "for debugging later" (no test for this)
  logger.info('Processing order', { orderId: order.id });

  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  return { ...order, total: total * (1 + taxRate) };
};
```

```typescript
// GOOD: Only code demanded by tests
const processOrder = (order: Order): ProcessedOrder => {
  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  const tax = total * TAX_RATE;
  return { ...order, total: total + tax };
};
```

The good version looks dangerously simple. That is the point. When you need null handling, you will write a test that passes `null` and expects a specific behavior. When you need configurable tax rates, you will write a test for that. The code will grow exactly as fast as the requirements demand, and every line will be covered.

The speculative version has three untested code paths. Those paths might have bugs. Nobody will know, because nobody tested them. And when requirements change, those "flexible" abstractions will almost certainly be wrong, because they were designed for imaginary requirements.

---

## 6. 100% Coverage Through Behavior

Coverage is a frequently misunderstood metric. Here is the correct mental model:

**Coverage is a side effect of thorough behavioral testing, not a goal to pursue directly.**

When coverage drops below 100%, the question is not "what line am I missing?" The question is:

> "What business behavior am I not testing?"

This reframing matters because it leads you to write useful tests. "Line 47 is uncovered" leads to a test that exercises line 47 but asserts nothing meaningful. "Users with expired subscriptions should not be able to place orders" leads to a test that catches real bugs.

### Coverage Theater

Be aware of tests that inflate coverage numbers without testing anything real:

```typescript
// BAD: 100% coverage, 0% confidence
it('processes payment', () => {
  const spy = vi.spyOn(processor, 'process');
  handlePayment(getMockPayment());
  expect(spy).toHaveBeenCalled(); // Asserts the code ran, not what it did
});
```

This test achieves line coverage because the code executes. But it does not verify any behavior. If `handlePayment` charged the wrong amount, returned the wrong status, or corrupted data, this test would still pass.

```typescript
// GOOD: Coverage earned through behavioral assertions
it('should charge the correct amount including tax', () => {
  const payment = getMockPayment({ amount: 100 });
  const result = handlePayment(payment);

  expect(result.success).toBe(true);
  expect(result.charged).toBe(115); // 100 + 15% tax
});

it('should reject payments over the daily limit', () => {
  const payment = getMockPayment({ amount: 15000 });
  const result = handlePayment(payment);

  expect(result.success).toBe(false);
  expect(result.error).toContain('exceeds daily limit');
});
```

### Verification Is Non-Negotiable

Never trust a coverage claim without running the numbers yourself:

```bash
pnpm exec vitest run --coverage
```

Check all four metrics -- Statements, Branches, Functions, and Lines. A project can show 100% line coverage while sitting at 60% branch coverage, meaning entire conditional paths are untested.

---

## 7. TDD Evidence in Commits

Your commit history is not just a log -- it is evidence of your process. When reviewers look at a PR, they should be able to see the TDD progression.

### What Good Evidence Looks Like

```
a1b2c3d test: add failing test for order total calculation
e4f5a6b feat: implement order total calculation
c7d8e9f test: add failing test for free shipping over $50
1a2b3c4 feat: apply free shipping for orders over $50
5d6e7f8 refactor: extract shipping cost calculation
9a0b1c2 test: add failing test for tax calculation by region
d3e4f5a feat: implement regional tax calculation
```

Each pair of `test:` and `feat:` commits shows a RED-GREEN cycle. The `refactor:` commit stands alone, always following a green state. A reviewer can verify that tests came first without reading a single line of code.

### Conventional Commit Prefixes

| Prefix | When to Use |
|---|---|
| `test:` | Adding a failing test (RED phase) |
| `feat:` | Making a test pass with new functionality (GREEN phase) |
| `fix:` | Making a test pass by correcting a bug (GREEN phase) |
| `refactor:` | Restructuring without behavior change (REFACTOR phase) |

### Documenting Exceptions

When multi-session work, rebasing, or squashing disrupts the linear trail, document the TDD evidence explicitly in your PR description:

```markdown
## TDD Evidence

RED phase: commit c925187 (added failing tests for shopping cart)
GREEN phase: commits 5e0055b, 9a246d0 (implementation + bug fixes)
REFACTOR: commit 11dbd1a (test isolation improvements)

Test Evidence:
- 4/4 tests passing (7.7s with 4 workers)
- 100% coverage verified
```

The point is not bureaucracy. The point is that anyone reviewing your work can verify the discipline was followed, even when the commit history is not perfectly linear.

---

## 8. Anti-Patterns

These are the patterns that undermine TDD. Learn to recognize them in your own work and in code reviews.

### Writing Production Code Without a Failing Test

This is the cardinal violation. It does not matter how small the change is. A one-line bug fix still starts with a test that reproduces the bug:

```typescript
// RED: Reproduce the bug
it('should handle emails with plus addressing', () => {
  const result = validateEmail('user+tag@example.com');
  expect(result.valid).toBe(true); // Currently fails -- bug confirmed
});

// GREEN: Fix the bug
// (update the regex or validation logic to handle + characters)
```

### Testing Implementation Details

If your test uses `vi.spyOn` on an internal method, it is testing implementation, not behavior:

```typescript
// BAD: Coupled to internal structure
it('should call the formatter', () => {
  const spy = vi.spyOn(internals, 'formatCurrency');
  calculateTotal(order);
  expect(spy).toHaveBeenCalled();
});

// GOOD: Tests the observable result
it('should return the total formatted as currency', () => {
  const result = calculateTotal(order);
  expect(result.displayTotal).toBe('$115.00');
});
```

The bad test breaks when you rename `formatCurrency` or inline it. The good test survives any refactoring that preserves the behavior.

### 1:1 Mapping Between Test Files and Implementation Files

When every `foo.ts` has a `foo.test.ts`, your tests are organized around *files* rather than *behaviors*:

```
# BAD: Tests mirror file structure
src/
  cart-validator.ts
  cart-calculator.ts
  cart-formatter.ts
tests/
  cart-validator.test.ts
  cart-calculator.test.ts
  cart-formatter.test.ts

# GOOD: Tests describe behaviors
src/
  cart-validator.ts
  cart-calculator.ts
  cart-formatter.ts
tests/
  add-items-to-cart.test.ts
  calculate-cart-total.test.ts
  checkout.test.ts
```

When you test behaviors, internal files can be merged, split, or renamed without touching the test suite.

### Using `let`/`beforeEach` for Test Data

Shared mutable state between tests creates coupling and ordering bugs:

```typescript
// BAD: Shared mutable state
describe('order processing', () => {
  let order: Order;

  beforeEach(() => {
    order = { id: 'order-1', items: [], total: 0 };
  });

  it('adds an item', () => {
    order.items.push(getMockItem({ price: 100 }));
    const result = processOrder(order);
    expect(result.total).toBe(100);
  });

  it('calculates shipping', () => {
    // Does this test assume items from the previous test?
    // Is order.items empty or not? You have to trace the beforeEach.
    const result = calculateShipping(order);
    expect(result.shipping).toBe(5.99);
  });
});
```

```typescript
// GOOD: Factory functions, no shared state
const getMockOrder = (overrides?: Partial<Order>): Order =>
  OrderSchema.parse({
    id: 'order-1',
    items: [getMockItem()],
    total: 0,
    ...overrides,
  });

describe('order processing', () => {
  it('calculates total from item prices', () => {
    const order = getMockOrder({
      items: [getMockItem({ price: 100 }), getMockItem({ price: 200 })],
    });
    const result = processOrder(order);
    expect(result.total).toBe(300);
  });

  it('applies free shipping for orders over $50', () => {
    const order = getMockOrder({
      items: [getMockItem({ price: 75 })],
    });
    const result = calculateShipping(order);
    expect(result.shipping).toBe(0);
  });
});
```

Each test is self-contained. You can read any test in isolation and understand exactly what it sets up, what it does, and what it expects.

### Trusting Coverage Claims Without Verification

A PR that says "100% coverage" means nothing until you run the coverage report yourself:

```bash
pnpm exec vitest run --coverage
```

Check the "All files" summary line. All four metrics -- Statements, Branches, Functions, Lines -- must be at 100%. If the "Uncovered Line #s" column shows anything, coverage is incomplete.

---

## Putting It All Together: A Complete TDD Cycle

Let us walk through a complete feature built with strict TDD. We are building a function that calculates a discount based on a customer's order history.

### Cycle 1: Basic discount for returning customers

**RED:**

```typescript
describe('calculateDiscount', () => {
  it('should apply 10% discount for customers with 5+ previous orders', () => {
    const customer = getMockCustomer({ previousOrders: 5 });
    const order = getMockOrder({ subtotal: 200 });

    const result = calculateDiscount(customer, order);

    expect(result.discountPercent).toBe(10);
    expect(result.discountedTotal).toBe(180);
  });
});
```

**GREEN:**

```typescript
const calculateDiscount = (
  customer: Customer,
  order: Order,
): DiscountResult => {
  if (customer.previousOrders >= 5) {
    const discountPercent = 10;
    const discountedTotal = order.subtotal * (1 - discountPercent / 100);
    return { discountPercent, discountedTotal };
  }
  return { discountPercent: 0, discountedTotal: order.subtotal };
};
```

**Commit:** `feat: apply 10% discount for returning customers`

### Cycle 2: No discount for new customers

**RED:**

```typescript
it('should apply no discount for customers with fewer than 5 orders', () => {
  const customer = getMockCustomer({ previousOrders: 2 });
  const order = getMockOrder({ subtotal: 200 });

  const result = calculateDiscount(customer, order);

  expect(result.discountPercent).toBe(0);
  expect(result.discountedTotal).toBe(200);
});
```

This test already passes with our current implementation. That tells us something: the behavior was already covered. We move on without writing new production code.

### Cycle 3: Premium discount tier

**RED:**

```typescript
it('should apply 20% discount for customers with 20+ previous orders', () => {
  const customer = getMockCustomer({ previousOrders: 20 });
  const order = getMockOrder({ subtotal: 200 });

  const result = calculateDiscount(customer, order);

  expect(result.discountPercent).toBe(20);
  expect(result.discountedTotal).toBe(160);
});
```

**GREEN:**

```typescript
const calculateDiscount = (
  customer: Customer,
  order: Order,
): DiscountResult => {
  const discountPercent =
    customer.previousOrders >= 20 ? 20 :
    customer.previousOrders >= 5 ? 10 :
    0;

  const discountedTotal = order.subtotal * (1 - discountPercent / 100);
  return { discountPercent, discountedTotal };
};
```

**Commit:** `feat: add premium 20% discount tier for loyal customers`

**REFACTOR (assessed, decided to act):**

```typescript
const DISCOUNT_TIERS = [
  { minOrders: 20, percent: 20 },
  { minOrders: 5, percent: 10 },
] as const;

const calculateDiscount = (
  customer: Customer,
  order: Order,
): DiscountResult => {
  const tier = DISCOUNT_TIERS.find(
    (t) => customer.previousOrders >= t.minOrders,
  );
  const discountPercent = tier?.percent ?? 0;
  const discountedTotal = order.subtotal * (1 - discountPercent / 100);

  return { discountPercent, discountedTotal };
};
```

**Commit:** `refactor: extract discount tiers into configuration`

Notice: the refactoring changed the structure but not the behavior. All tests still pass. And because we committed after green, we could revert the refactoring if it turned out to be a bad idea.

---

## Summary Checklist

Use this as a quick reference when you are in the flow.

### Before Writing Any Production Code

- [ ] There is a failing test that demands this code
- [ ] The test describes behavior, not implementation
- [ ] The test fails for the right reason

### After Making a Test Pass (GREEN)

- [ ] Only the minimum code was written to pass the test
- [ ] No speculative "just in case" code was added
- [ ] Commit the working code now (safety net for refactoring)

### After Refactoring

- [ ] All tests still pass without modification
- [ ] No new behavior was introduced (that requires a new RED phase)
- [ ] Refactoring is committed separately from the feature

### At the End of a Feature

- [ ] Commit history shows RED-GREEN-REFACTOR progression
- [ ] Coverage is verified at 100% (all four metrics)
- [ ] Every test verifies behavior through the public API
- [ ] No `let`/`beforeEach` for test data -- factory functions used
- [ ] No spies on internal methods
- [ ] No 1:1 mapping between test files and implementation files
- [ ] PR documents TDD evidence (especially if commit history is non-linear)
- [ ] No speculative code exists -- every line was demanded by a test

---

*Next chapter: [Chapter 2 -- Behavior-Driven Testing: Test What, Not How](./02_Behavior_Driven_Testing.md)*
