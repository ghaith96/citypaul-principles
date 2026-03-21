# Chapter 3: Mutation Testing — Proving Your Tests Actually Work

## The Uncomfortable Truth About Coverage

You have 100% line coverage. Your CI badge is green. Your team lead is happy.

And your test suite would miss 40% of the bugs that could ship to production.

This is not a hypothetical. It happens constantly in real codebases, and it happens because we confuse two very different questions:

1. **"Did my tests execute this code?"** — This is what coverage measures.
2. **"Would my tests catch a bug in this code?"** — This is what coverage *cannot* tell you.

Consider this function:

```typescript
function calculateDiscount(price: number, quantity: number): number {
  if (quantity >= 10) {
    return price * 0.9;
  }
  return price;
}
```

And this test:

```typescript
test("applies discount for bulk orders", () => {
  expect(calculateDiscount(100, 15)).toBe(90);
});

test("no discount for small orders", () => {
  expect(calculateDiscount(100, 5)).toBe(100);
});
```

Coverage report: 100% lines, 100% branches. Everything is green.

Now imagine a developer accidentally changes `>= 10` to `> 10`. The tests still pass. A customer ordering exactly 10 items stops getting their discount. Nobody notices until they complain.

Coverage told you the code was tested. It lied.

---

## The Mental Model

Mutation testing asks a brutally simple question: **if I introduce a small bug into the production code, does at least one test fail?**

The process works like this:

1. Take your production code.
2. Make a small, deliberate change — called a **mutant**. For example, change `>=` to `>`.
3. Run your test suite against the mutated code.
4. Check the result.

There are only two outcomes:

- **Killed mutant**: A test failed. Your test suite detected the change. This is good — it means your tests are actually guarding that behaviour.
- **Survived mutant**: All tests still passed. Your test suite has a blind spot. The mutant lived, and that same bug could ship undetected.

The **mutation score** is the percentage of mutants your tests killed. A mutation score of 85% means your tests would catch 85% of the small bugs a mutation tool could introduce.

Think of it this way: coverage is like checking that a security guard walked past every room. Mutation testing is like checking that the guard would actually *notice* if someone broke in.

---

## Key Mutation Operators

A mutation operator is a rule for how to change the code. Each one simulates a specific category of mistake a developer could make. Understanding them helps you write tests that are resilient by default.

### Arithmetic Operators

The tool swaps arithmetic operators: `+` becomes `-`, `*` becomes `/`, and so on.

```typescript
// Production code
function calculateTotal(price: number, quantity: number): number {
  return price * quantity;
}
```

**Weak test (mutant survives):**

```typescript
test("calculates total", () => {
  // BAD: 10 * 1 === 10, but 10 / 1 === 10 too!
  expect(calculateTotal(10, 1)).toBe(10);
});
```

**Strong test (mutant killed):**

```typescript
test("calculates total", () => {
  // GOOD: 10 * 3 === 30, and 10 / 3 !== 30
  expect(calculateTotal(10, 3)).toBe(30);
});
```

### Conditional Operators

The tool changes relational operators: `>=` becomes `>`, `<` becomes `<=`, `===` becomes `!==`, and so on. These are the most commonly surviving mutants in real codebases because developers rarely test at exact boundaries.

```typescript
// Production code
function isEligibleForDiscount(orderCount: number): boolean {
  return orderCount >= 5;
}
```

**Weak test (mutant survives):**

```typescript
test("eligible with many orders", () => {
  // BAD: 20 >= 5 is true, and 20 > 5 is also true
  expect(isEligibleForDiscount(20)).toBe(true);
});
```

**Strong test (mutant killed):**

```typescript
test("eligible at exact threshold", () => {
  // GOOD: 5 >= 5 is true, but 5 > 5 is false
  expect(isEligibleForDiscount(5)).toBe(true);
});
```

### Boolean Logic

The tool swaps logical operators: `&&` becomes `||`, `!` is removed, `true` becomes `false`.

```typescript
// Production code
function canAccessPremiumContent(
  isSubscribed: boolean,
  isTrialActive: boolean
): boolean {
  return isSubscribed && isTrialActive;
}
```

**Weak test (mutant survives):**

```typescript
test("grants access when both conditions met", () => {
  // BAD: true && true === true, and true || true === true
  expect(canAccessPremiumContent(true, true)).toBe(true);
});
```

**Strong test (mutant killed):**

```typescript
test("denies access when only one condition met", () => {
  // GOOD: false && true === false, but false || true === true
  expect(canAccessPremiumContent(false, true)).toBe(false);
});

test("grants access when both conditions met", () => {
  expect(canAccessPremiumContent(true, true)).toBe(true);
});
```

To kill `&&` vs `||`, you need a test case where the two inputs *differ*. If both are `true` or both are `false`, the operators behave identically.

### Block Removal

The tool removes entire blocks of code — the body of an `if` statement, a `for` loop, or a function call.

```typescript
// Production code
function processOrder(order: Order): Order {
  validateInventory(order);
  const total = calculateTotal(order.items);
  applyLoyaltyPoints(order.customerId, total);
  return { ...order, total, status: "processed" };
}
```

If `applyLoyaltyPoints(order.customerId, total)` is removed and no test fails, your test suite does not verify that side effect. This is one of the most dangerous blind spots — the function "works" but silently drops important behaviour.

**Strong test (mutant killed):**

```typescript
test("awards loyalty points when order is processed", () => {
  const spy = vi.spyOn(loyaltyService, "applyLoyaltyPoints");
  processOrder(mockOrder);
  expect(spy).toHaveBeenCalledWith("customer-123", 250);
});
```

### Method Swaps

The tool replaces methods with semantically related alternatives: `some()` becomes `every()`, `startsWith()` becomes `endsWith()`, `indexOf()` becomes `lastIndexOf()`.

```typescript
// Production code
function hasActiveSubscription(users: User[]): boolean {
  return users.some((user) => user.isActive);
}
```

**Weak test (mutant survives):**

```typescript
test("returns true when all users are active", () => {
  const users = [
    { isActive: true },
    { isActive: true },
  ];
  // BAD: some() and every() both return true when all elements match
  expect(hasActiveSubscription(users)).toBe(true);
});
```

**Strong test (mutant killed):**

```typescript
test("returns true when at least one user is active", () => {
  const users = [
    { isActive: false },
    { isActive: true },
  ];
  // GOOD: some() returns true, every() returns false
  expect(hasActiveSubscription(users)).toBe(true);
});
```

---

## The Identity Value Trap

This is the single most common reason mutants survive, and once you see the pattern you will never unsee it.

Certain values are **identity elements** — they produce the same result regardless of which operator is used. When you use these values in tests, you are writing tests that *look* meaningful but prove nothing.

| Operation | Identity Value | Why It Fails |
|-----------|---------------|--------------|
| Addition / Subtraction | `0` | `x + 0 === x - 0` |
| Multiplication / Division | `1` | `x * 1 === x / 1` |
| Boolean AND / OR | All `true` | `true && true === true \|\| true` |
| Boolean AND / OR | All `false` | `false && false === false \|\| false` |
| `some()` / `every()` | All matching | `[true].some(…) === [true].every(…)` |
| `some()` / `every()` | None matching | `[false].some(…) === [false].every(…)` |
| String concatenation | Empty string `""` | `x + "" === x` |

**The rule is simple: choose test values that force the operators apart.**

Bad test (identity values everywhere):

```typescript
test("applies tax", () => {
  // 100 + 0 === 100 - 0 === 100
  expect(applyTax(100, 0)).toBe(100);
});

test("scales quantity", () => {
  // 50 * 1 === 50 / 1 === 50
  expect(scaleQuantity(50, 1)).toBe(50);
});
```

Good test (values that discriminate):

```typescript
test("applies tax", () => {
  // 100 + 7 === 107, but 100 - 7 === 93
  expect(applyTax(100, 7)).toBe(107);
});

test("scales quantity", () => {
  // 50 * 3 === 150, but 50 / 3 !== 150
  expect(scaleQuantity(50, 3)).toBe(150);
});
```

---

## Boundary Value Testing

If there is one takeaway from this chapter that will most improve your test quality, it is this:

> **Always write a test at the exact boundary value.**

The mutation `>=` to `>` is the most commonly surviving mutant across all codebases. It survives because developers test with values far from the boundary, where both operators agree.

```typescript
// Production code
function categorizeAge(age: number): string {
  if (age >= 18) return "adult";
  if (age >= 13) return "teenager";
  return "child";
}
```

**Weak tests (boundary mutants survive):**

```typescript
test("adult", () => {
  expect(categorizeAge(25)).toBe("adult");   // 25 >= 18 AND 25 > 18
});

test("teenager", () => {
  expect(categorizeAge(15)).toBe("teenager"); // 15 >= 13 AND 15 > 13
});

test("child", () => {
  expect(categorizeAge(5)).toBe("child");
});
```

**Strong tests (boundary mutants killed):**

```typescript
test("adult at exact boundary", () => {
  expect(categorizeAge(18)).toBe("adult");    // 18 >= 18 is true, 18 > 18 is false
});

test("teenager just below adult boundary", () => {
  expect(categorizeAge(17)).toBe("teenager"); // confirms 17 is NOT adult
});

test("teenager at exact boundary", () => {
  expect(categorizeAge(13)).toBe("teenager"); // 13 >= 13 is true, 13 > 13 is false
});

test("child just below teenager boundary", () => {
  expect(categorizeAge(12)).toBe("child");    // confirms 12 is NOT teenager
});
```

The pattern: for every boundary condition, test the value **at** the boundary and the value **one step below** (or above, depending on direction). This kills both the `>=` to `>` mutant and the boundary-shift mutants.

---

## The Four Questions

When you look at a line of production code, train yourself to ask these four questions. Over time, this becomes automatic and your tests get dramatically stronger.

### 1. "If I changed this operator, would a test fail?"

```typescript
// Could + become - without a test failing?
const total = price + tax;
// Could && become || without a test failing?
const isValid = hasName && hasEmail;
```

If the answer is "no test would fail," you need a test case that distinguishes between the two operators.

### 2. "If I negated this condition, would a test fail?"

```typescript
// Would a test catch `if (!isActive)` vs `if (isActive)`?
if (isActive) {
  enableFeature();
}
```

You need tests for both the truthy and falsy branches, with assertions on the *outcomes* of each.

### 3. "If I removed this line, would a test fail?"

```typescript
function createUser(data: UserInput): User {
  const user = mapToUser(data);
  sendWelcomeEmail(user.email);   // If this line disappears, does a test fail?
  return user;
}
```

Side effects are the most common victims of block-removal mutations. If you are not asserting that the side effect happened, its removal is invisible.

### 4. "If I returned early here, would a test fail?"

```typescript
function enrichProfile(profile: Profile): Profile {
  profile.score = calculateScore(profile);
  // If a `return profile;` appeared here, would tests catch
  // that the lines below never execute?
  profile.tier = deriveTier(profile.score);
  profile.badges = assignBadges(profile);
  return profile;
}
```

If you only assert on `score` but not on `tier` or `badges`, an early return after the first assignment goes undetected.

---

## Equivalent Mutants

Not all survived mutants represent a real weakness. Some mutations produce **equivalent** code — the behaviour is identical to the original, so no test *can* kill them.

```typescript
// Original
function clamp(value: number, max: number): number {
  if (value > max) return max;
  return value;
}

// Mutation: change > to >=
function clamp(value: number, max: number): number {
  if (value >= max) return max;
  return value;
}
```

When `value === max`, the original returns `value` (which equals `max`) and the mutant returns `max`. The result is identical. This mutant is **equivalent** — it cannot be killed because the mutation does not change observable behaviour.

Equivalent mutants are a known limitation. They inflate the "survived" count and lower your mutation score, but they do not represent a real gap in your tests.

**How to handle them:**

- Do not chase 100% mutation score. Aim for a meaningful score (typically 80-90%) and review the survivors.
- When you encounter a survived mutant, ask: "Is there *any* input that would make the original and mutated code behave differently?" If not, it is equivalent — move on.
- Some mutation testing tools allow you to annotate equivalent mutants so they are excluded from future runs.

---

## Integration with TDD

If you practice TDD, mutation thinking extends the cycle naturally:

```
RED → GREEN → REFACTOR → MUTATE
```

### RED

Write a failing test that describes the behaviour you want.

### GREEN

Write the minimum production code to make the test pass.

### REFACTOR

Clean up duplication and improve structure without changing behaviour.

### MUTATE

Ask: **"Would my tests catch relevant mutations to the code I just wrote?"**

This does not mean you run a mutation testing tool after every cycle. It means you develop a mental habit. After making a test pass, pause and consider:

- Did I use identity values? (`0`, `1`, `true/true`, empty arrays)
- Did I test at exact boundary values?
- If there is a logical operator, did I test with mixed boolean inputs?
- If there is an array method like `some()`, did I test with a mixed array?

When you catch yourself about to commit a test with `expect(add(5, 0)).toBe(5)`, you stop and write `expect(add(5, 3)).toBe(8)` instead. This costs you nothing and makes your test meaningfully stronger.

### Practical workflow

Run your mutation testing tool periodically — perhaps as part of a weekly quality check or on critical modules before release. Use the results to:

1. Identify the weakest areas in your test suite.
2. Write targeted tests to kill the most important surviving mutants.
3. Build team awareness of common patterns (boundary values, identity values, side effects).

Over time, engineers who think in terms of mutations write stronger tests *before* running the tool. The tool becomes a verification step, not a discovery step.

---

## Worked Example: Bringing It All Together

Consider a small module for evaluating shipping eligibility:

```typescript
interface Order {
  items: CartItem[];
  subtotal: number;
  destination: string;
}

function isEligibleForFreeShipping(order: Order): boolean {
  const hasEnoughItems = order.items.length >= 3;
  const meetsMinimum = order.subtotal >= 50;
  const isDomestic = order.destination.startsWith("US");

  return hasEnoughItems && meetsMinimum && isDomestic;
}
```

A naive test suite:

```typescript
test("eligible order gets free shipping", () => {
  const order = {
    items: [item1, item2, item3, item4],
    subtotal: 100,
    destination: "US-NY",
  };
  expect(isEligibleForFreeShipping(order)).toBe(true);
});

test("ineligible order does not get free shipping", () => {
  const order = {
    items: [],
    subtotal: 0,
    destination: "CA-ON",
  };
  expect(isEligibleForFreeShipping(order)).toBe(false);
});
```

Coverage: 100%. Mutation survivors: many.

- `>= 3` to `> 3`: survives (4 items pass both)
- `>= 50` to `> 50`: survives (100 passes both)
- `&&` to `||`: survives in the second test (all conditions are `false`, so `&&` and `||` agree)
- `startsWith` to `endsWith`: survives (first test uses "US-NY" which does not end with "US")

A mutation-aware test suite:

```typescript
test("eligible when all conditions met", () => {
  const order = {
    items: [item1, item2, item3],       // exactly 3 — kills >= vs >
    subtotal: 50,                        // exactly 50 — kills >= vs >
    destination: "US-NY",
  };
  expect(isEligibleForFreeShipping(order)).toBe(true);
});

test("ineligible when items below threshold", () => {
  const order = {
    items: [item1, item2],              // 2 items, subtotal and destination valid
    subtotal: 75,
    destination: "US-CA",
  };
  // Kills && vs || for hasEnoughItems (false && true && true vs false || true || true)
  expect(isEligibleForFreeShipping(order)).toBe(false);
});

test("ineligible when subtotal below threshold", () => {
  const order = {
    items: [item1, item2, item3],
    subtotal: 49,                        // just below boundary
    destination: "US-TX",
  };
  expect(isEligibleForFreeShipping(order)).toBe(false);
});

test("ineligible for international orders", () => {
  const order = {
    items: [item1, item2, item3, item4],
    subtotal: 200,
    destination: "DE-BE",               // does not start with "US"
  };
  expect(isEligibleForFreeShipping(order)).toBe(false);
});

test("startsWith not endsWith", () => {
  const order = {
    items: [item1, item2, item3],
    subtotal: 75,
    destination: "CA-US",               // ends with "US" but doesn't start with it
  };
  // Kills startsWith vs endsWith mutation
  expect(isEligibleForFreeShipping(order)).toBe(false);
});
```

Every operator, boundary, and method call is now covered by a test that would fail if mutated.

---

## Summary Checklist

Use this as a quick reference when writing or reviewing tests:

- [ ] **No identity values**: Avoid `0` for addition, `1` for multiplication, all-`true`/all-`false` for boolean logic, empty arrays, and empty strings as test inputs.
- [ ] **Boundary values tested**: For every `>=`, `<=`, `>`, `<` in production code, there is a test at the exact boundary value.
- [ ] **Boolean operators tested with mixed inputs**: If production code uses `&&` or `||`, at least one test case has inputs where the two operands differ in truthiness.
- [ ] **Array methods tested with mixed arrays**: If code uses `some()`, test with an array where only *some* elements match. If code uses `every()`, test with an array where at least one element does not match.
- [ ] **Side effects asserted**: Every meaningful side effect (API call, event emission, database write) has a test that verifies it happened.
- [ ] **No silent line removal**: For every line that performs a meaningful action, ask whether removing it would cause at least one test to fail.
- [ ] **String methods tested for direction**: If code uses `startsWith()`, include a test value that ends with (but does not start with) the target string.
- [ ] **Early return coverage**: Assert on values set throughout the function, not just the first computation, to prevent undetected early returns.
- [ ] **Mutation thinking in TDD**: After GREEN, ask "would my tests catch mutations?" before moving to REFACTOR.
- [ ] **Equivalent mutants acknowledged**: When reviewing mutation results, verify that survived mutants represent real gaps rather than equivalent mutations before adding new tests.
