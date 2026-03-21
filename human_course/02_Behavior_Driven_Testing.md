# Chapter 2: Behavior-Driven Testing — Test What, Not How

## The Mental Model

Before we talk about patterns, rules, or tooling, we need to talk about what a test
actually *is*.

A test is a contract. It says: "Given this input, I expect this outcome." That contract
should hold regardless of how the system fulfills it internally. If you swap out an
algorithm, rename a private helper, or restructure your modules, every test that was
passing before should still pass — provided the system still does what it promised.

The moment a test breaks because you moved code around *without changing behavior*, that
test was never verifying behavior. It was verifying structure. Structure changes. Behavior
is the thing your users (and your team) actually care about.

This is the core insight: **test behavior, not implementation.**

It sounds obvious. It is not. Most codebases violate this principle constantly, and the
result is a test suite that actively fights you during refactoring — the exact moment
you need confidence the most.

---

## 1. The Core Insight: 100% Coverage Through Business Behavior

Consider a payment processing module. You have a `payment-validator.ts` file with
several validation functions, and a `payment-processor.ts` that orchestrates the flow.

The implementation-driven approach says: "I have a validator file, so I need a validator
test file. Let me test each validation function directly."

The behavior-driven approach says: "What does `processPayment()` promise to do? It should
reject expired cards, reject insufficient funds, and return a confirmation for valid
payments. Let me test those promises."

Here is the critical realization: if your behavioral tests for `processPayment()` exercise
every validation path — expired cards, invalid CVVs, insufficient funds, malformed card
numbers — then `payment-validator.ts` already has 100% coverage. You never tested it
directly, and you never needed to.

```typescript
// payment-validator.ts (implementation detail — do NOT test directly)
export function validateCardNumber(cardNumber: string): boolean {
  const stripped = cardNumber.replace(/\s/g, '');
  if (stripped.length < 13 || stripped.length > 19) return false;
  return luhnCheck(stripped);
}

export function validateExpiry(month: number, year: number): boolean {
  const now = new Date();
  const expiry = new Date(year, month);
  return expiry > now;
}

// payment-processor.ts (the public API)
export async function processPayment(request: PaymentRequest): Promise<PaymentResult> {
  if (!validateCardNumber(request.cardNumber)) {
    return { success: false, error: 'INVALID_CARD_NUMBER' };
  }
  if (!validateExpiry(request.expiryMonth, request.expiryYear)) {
    return { success: false, error: 'CARD_EXPIRED' };
  }
  // ... charge the card, return confirmation
}
```

Your tests target `processPayment` and nothing else:

```typescript
// process-payment.test.ts
describe('processPayment', () => {
  it('rejects an invalid card number', async () => {
    const request = getPaymentRequest({ cardNumber: '0000000000000' });
    const result = await processPayment(request);

    expect(result).toEqual({
      success: false,
      error: 'INVALID_CARD_NUMBER',
    });
  });

  it('rejects an expired card', async () => {
    const request = getPaymentRequest({ expiryMonth: 1, expiryYear: 2020 });
    const result = await processPayment(request);

    expect(result).toEqual({
      success: false,
      error: 'CARD_EXPIRED',
    });
  });

  it('returns a confirmation for a valid payment', async () => {
    const request = getPaymentRequest();
    const result = await processPayment(request);

    expect(result.success).toBe(true);
    expect(result.confirmationId).toBeDefined();
  });
});
```

Every line in `payment-validator.ts` is covered. You never imported it in a test file.
If you later inline those validators, merge them, or rewrite them with a completely
different algorithm, *not a single test changes*.

---

## 2. Test Through the Public API Only

"Public API" does not mean "exported function." It means the interface that consumers
depend on. A function can be exported for use by other internal modules and still be an
implementation detail from the perspective of a test suite.

Ask yourself: "If I deleted this function and inlined its logic into the caller, would
any consumer's code break?" If the answer is no, it is an implementation detail.

### Why This Matters

1. **Tests survive refactoring.** Renaming an internal helper, splitting a function,
   or changing a data structure does not break tests that only touch the public boundary.

2. **Tests document intended behavior.** A test that says "when I submit an expired card,
   I get an error" is meaningful documentation. A test that says "validateExpiry returns
   false when year is in the past" tells you nothing about the system's promises.

3. **Tests catch real bugs.** A bug is a violation of expected behavior. If your tests
   verify behavior, they catch bugs. If they verify wiring, they catch refactors.

### Bad: Spying on Internals

```typescript
// BAD — testing implementation, not behavior
import { processPayment } from './payment-processor';
import * as validator from './payment-validator';

it('calls validateCardNumber during processing', () => {
  const spy = jest.spyOn(validator, 'validateCardNumber');

  processPayment(getPaymentRequest());

  expect(spy).toHaveBeenCalledWith('4111111111111111');
});
```

This test tells you that `processPayment` calls `validateCardNumber`. It does not tell
you what happens when the card number is invalid. It will break the instant you rename
or inline that function. It is testing *how*, not *what*.

### Bad: Testing Private State

```typescript
// BAD — reaching into internal state
it('sets the internal validation flag', () => {
  const processor = new PaymentProcessor();
  processor.validate(getPaymentRequest());

  // Accessing a private property — this is a test smell
  expect((processor as any)._isValidated).toBe(true);
});
```

Internal state is not a promise. The system never said "I will set `_isValidated` to
true." It said "I will reject invalid payments and accept valid ones." Test the promise.

### Good: Testing Observable Outcomes

```typescript
// GOOD — testing what the system promises
it('rejects a payment when the card number fails Luhn check', async () => {
  const request = getPaymentRequest({ cardNumber: '1234567890123' });

  const result = await processPayment(request);

  expect(result.success).toBe(false);
  expect(result.error).toBe('INVALID_CARD_NUMBER');
});
```

Observable outcomes include: return values, thrown errors, emitted events, side effects
on injected dependencies (database writes, HTTP calls), and changes to publicly accessible
state.

---

## 3. The Test Factory Pattern

Shared mutable state is the single most common source of flaky, coupled, and
hard-to-read tests. The fix is simple: factories.

### The Problem with `let` / `beforeEach`

```typescript
// BAD — shared mutable state
describe('processPayment', () => {
  let request: PaymentRequest;

  beforeEach(() => {
    request = {
      cardNumber: '4111111111111111',
      expiryMonth: 12,
      expiryYear: 2030,
      cvv: '123',
      amount: 100,
      currency: 'USD',
    };
  });

  it('rejects an expired card', async () => {
    request.expiryYear = 2020; // mutation!
    const result = await processPayment(request);
    expect(result.success).toBe(false);
  });

  it('processes a valid payment', async () => {
    // Is request still the default? Did the previous test mutate it?
    // beforeEach resets it, but you have to scroll up to know that.
    const result = await processPayment(request);
    expect(result.success).toBe(true);
  });
});
```

This pattern has three problems:

1. **Hidden setup.** You cannot read a single test and understand what it does. You have
   to scroll to `beforeEach`, mentally apply the mutations, then scroll back.

2. **Coupling.** If you add a required field to `PaymentRequest`, you fix it in one place
   (`beforeEach`) and hope every test still makes sense. Often they do not.

3. **Order sensitivity.** If `beforeEach` is removed or someone forgets it, tests bleed
   into each other.

### The Solution: Factory Functions

```typescript
// GOOD — factory with sensible defaults and Partial<T> overrides
const getPaymentRequest = (
  overrides?: Partial<PaymentRequest>
): PaymentRequest => {
  return PaymentRequestSchema.parse({
    cardNumber: '4111111111111111',
    expiryMonth: 12,
    expiryYear: 2030,
    cvv: '123',
    amount: 100,
    currency: 'USD',
    ...overrides,
  });
};
```

Now every test is self-contained:

```typescript
it('rejects an expired card', async () => {
  const request = getPaymentRequest({ expiryYear: 2020 });
  const result = await processPayment(request);

  expect(result.success).toBe(false);
  expect(result.error).toBe('CARD_EXPIRED');
});

it('processes a valid payment', async () => {
  const request = getPaymentRequest();
  const result = await processPayment(request);

  expect(result.success).toBe(true);
});
```

Each test reads top to bottom. No shared state. No scrolling. The override makes the
test's intent obvious: "this test is about an expired card, everything else is default."

### Validate with Real Schemas

Notice the `PaymentRequestSchema.parse(...)` call in the factory. This is intentional.
Import your Zod schema (or Joi, or io-ts, or whatever you use) from production code.
Never redefine validation rules in your test utilities.

If the schema changes — say, `currency` becomes an enum instead of a free string — your
factory either adapts automatically (if the default is valid) or fails loudly at the
factory level, telling you exactly which tests need attention.

```typescript
// BAD — redefining validation in tests
const getPaymentRequest = (overrides?: Partial<PaymentRequest>): PaymentRequest => {
  const request = { ...defaults, ...overrides };
  // Hand-rolled validation that will drift from production
  if (!request.cardNumber) throw new Error('cardNumber required');
  return request as PaymentRequest;
};

// GOOD — using the production schema
import { PaymentRequestSchema } from '../src/schemas/payment';

const getPaymentRequest = (overrides?: Partial<PaymentRequest>): PaymentRequest => {
  return PaymentRequestSchema.parse({ ...defaults, ...overrides });
};
```

### Factory Composition for Nested Objects

When your types contain nested objects, compose your factories:

```typescript
const getAddress = (overrides?: Partial<Address>): Address => {
  return AddressSchema.parse({
    line1: '123 Test Street',
    city: 'London',
    postcode: 'EC1A 1BB',
    country: 'GB',
    ...overrides,
  });
};

const getCustomer = (overrides?: Partial<Customer>): Customer => {
  return CustomerSchema.parse({
    name: 'Jane Doe',
    email: 'jane@example.com',
    billingAddress: getAddress(),
    ...overrides,
  });
};

// Usage — override at any depth
const customer = getCustomer({
  billingAddress: getAddress({ country: 'US', postcode: '90210' }),
});
```

This scales cleanly. Each factory owns its defaults. Composition handles nesting.

---

## 4. Don't Extract for Testability

This is one of the most counterintuitive principles. You have a function with some
complex logic inside it. Your instinct says: "I should extract this into a separate
utility so I can test it in isolation."

Resist that instinct — unless you have a reason to extract that has nothing to do with
testing.

### Valid Reasons to Extract

- **Readability.** The function is long and a named helper makes the flow clearer.
- **Reuse (DRY).** The logic is needed in multiple places.
- **Separation of concerns.** The logic belongs in a different module conceptually.

### Invalid Reason to Extract

- **"So I can write a unit test for it."** If the logic is only used in one place,
  the behavioral tests for that one place already cover it. Extracting it creates a
  new public surface that you now have to maintain, document, and test separately.

```typescript
// BAD — extracted purely for testability
// string-utils.ts
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
}

// string-utils.test.ts
it('formats GBP correctly', () => {
  expect(formatCurrency(10.5, 'GBP')).toBe('£10.50');
});
```

If `formatCurrency` is only called inside `generateInvoice()`, then the test for
`generateInvoice()` already verifies that currency formatting works. The extraction
added a file, a test file, and a public export — all for zero additional confidence.

```typescript
// GOOD — inline the logic, test through the consumer
// invoice-generator.ts
export function generateInvoice(order: Order): Invoice {
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: order.currency,
  }).format(order.total);

  return { ...invoice, totalFormatted: formatted };
}

// generate-invoice.test.ts
it('formats the total as GBP currency', () => {
  const order = getOrder({ total: 10.5, currency: 'GBP' });
  const invoice = generateInvoice(order);

  expect(invoice.totalFormatted).toBe('£10.50');
});
```

Same confidence. Less surface area. And when you refactor `generateInvoice`, you do not
have a phantom `string-utils.test.ts` that breaks because you inlined the formatter.

---

## 5. No 1:1 Mapping Between Tests and Implementation

A common project structure looks like this:

```
src/
  payments/
    payment-validator.ts
    payment-processor.ts
    payment-formatter.ts

tests/
  payments/
    payment-validator.test.ts
    payment-processor.test.ts
    payment-formatter.test.ts
```

This is structural mirroring. It encodes an assumption: every file deserves its own test
file. That assumption is wrong.

When you mirror the structure, you create a one-to-one coupling between tests and
implementation files. Renaming a file breaks a test. Merging two files breaks a test.
Splitting a file requires creating a new test file. None of these changes affect behavior.

### Organize Tests by Behavior

```
src/
  payments/
    payment-validator.ts
    payment-processor.ts
    payment-formatter.ts

tests/
  payments/
    process-payment.test.ts
    refund-payment.test.ts
    generate-payment-receipt.test.ts
```

Each test file corresponds to a *capability*, not a source file. `process-payment.test.ts`
tests the full behavior of processing a payment, which might touch the validator, the
processor, and the formatter internally. You do not care. You care that "when I process
a valid payment, I get a confirmation with a formatted amount."

This structure survives any internal reorganization. You can merge all three source files
into one, split them into ten, or rewrite them in a completely different style. The test
files do not move, do not rename, and do not break.

---

## 6. Coverage Theater Detection

High test coverage is not the same as high test quality. It is possible — and common —
to have 100% line coverage and catch zero bugs. Here are the patterns to watch for.

### Pattern 1: Mocking the Function Being Tested

```typescript
// COVERAGE THEATER — you are testing your mock, not your code
jest.mock('./payment-processor', () => ({
  processPayment: jest.fn().mockResolvedValue({ success: true }),
}));

it('processes a payment successfully', async () => {
  const result = await processPayment(getPaymentRequest());
  expect(result.success).toBe(true);
});
```

This test will always pass. It will pass if `processPayment` is deleted. It will pass
if `processPayment` throws on every call. You are asserting against a value you
hard-coded two lines above. This is not a test. It is a tautology.

### Pattern 2: Testing Only That a Function Was Called

```typescript
// COVERAGE THEATER — verifying wiring, not behavior
it('calls the email service after signup', async () => {
  const sendSpy = jest.spyOn(emailService, 'send');

  await signUpUser(getSignUpRequest());

  expect(sendSpy).toHaveBeenCalled();
});
```

This proves `signUpUser` calls `emailService.send`. It does not prove the email has the
right recipient, the right subject, or the right body. If someone changes the email
template to say "Your account has been deleted," this test still passes.

The fix:

```typescript
// REAL TEST — verifying the behavior of the side effect
it('sends a welcome email to the new user', async () => {
  const sendSpy = jest.spyOn(emailService, 'send');

  await signUpUser(getSignUpRequest({ email: 'jane@example.com' }));

  expect(sendSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'jane@example.com',
      subject: expect.stringContaining('Welcome'),
    })
  );
});
```

### Pattern 3: Testing Trivial Getters and Setters

```typescript
// COVERAGE THEATER — testing the language, not the application
it('returns the name', () => {
  const user = new User('Jane');
  expect(user.getName()).toBe('Jane');
});

it('sets the name', () => {
  const user = new User('Jane');
  user.setName('John');
  expect(user.getName()).toBe('John');
});
```

You are testing that JavaScript assignment works. Unless `getName` or `setName` contains
business logic (validation, transformation, event emission), these tests add coverage
without adding confidence.

### Pattern 4: 100% Line Coverage, 0% Branch Coverage

```typescript
// Implementation
export function calculateDiscount(order: Order): number {
  if (order.isVIP) return order.total * 0.2;
  if (order.total > 100) return order.total * 0.1;
  if (order.couponCode) return order.total * 0.05;
  return 0;
}

// COVERAGE THEATER — only the happy path
it('calculates a VIP discount', () => {
  const order = getOrder({ isVIP: true, total: 200 });
  expect(calculateDiscount(order)).toBe(40);
});
```

This test covers *one* branch. The coverage report might show high line coverage because
the function is short, but three of four behaviors are untested. A bug in the coupon
logic will never be caught.

The fix is to test every business rule:

```typescript
it('gives VIP customers a 20% discount', () => {
  const order = getOrder({ isVIP: true, total: 200 });
  expect(calculateDiscount(order)).toBe(40);
});

it('gives a 10% discount for orders over 100', () => {
  const order = getOrder({ isVIP: false, total: 150 });
  expect(calculateDiscount(order)).toBe(15);
});

it('applies a 5% coupon discount for smaller orders', () => {
  const order = getOrder({ isVIP: false, total: 50, couponCode: 'SAVE5' });
  expect(calculateDiscount(order)).toBe(2.5);
});

it('returns zero when no discount applies', () => {
  const order = getOrder({ isVIP: false, total: 50 });
  expect(calculateDiscount(order)).toBe(0);
});
```

---

## 7. When Coverage Drops, Ask the Right Question

You push a PR and CI reports that coverage dropped from 87% to 84%. The wrong instinct
is: "Which lines are uncovered? Let me add tests for those lines."

That instinct leads you to write tests that exercise lines of code rather than verify
behavior. You end up with Pattern 1 or Pattern 2 from the section above — technically
covered, practically useless.

The right question is: **"What business behavior am I not testing?"**

Start from the feature, not the file:

1. What does this feature promise to the user?
2. What are the edge cases and error conditions?
3. Which of those promises do I not yet have a test for?

If you answer those questions and write tests for the missing behaviors, coverage will
rise as a *side effect*. And unlike line-chasing tests, these tests will actually catch
bugs.

Sometimes the answer is: "The uncovered lines are dead code." In that case, delete them.
Coverage goes up, codebase goes down, everyone wins.

Sometimes the answer is: "The uncovered lines are defensive error handling for an
unlikely edge case." Then write a test that triggers that edge case. That test has real
value — it proves the system handles a scenario that could happen in production.

Never write a test whose sole purpose is to make a number go up.

---

## Summary Checklist

Use this as a quick reference when writing or reviewing tests.

- [ ] **Am I testing behavior or implementation?** Can I refactor the internals without
      breaking this test? If not, the test is coupled to structure.

- [ ] **Am I testing through the public API?** Would a consumer of this module recognize
      what this test verifies? If the test imports internal helpers, it is testing too deep.

- [ ] **Am I using factories instead of shared mutable state?** Is every test
      self-contained and readable top to bottom? If I see `let` and `beforeEach` managing
      test data, I should switch to a factory.

- [ ] **Do my factories validate with real schemas?** Am I importing production schemas
      in my factory functions, or am I hand-rolling validation that will drift?

- [ ] **Did I extract this function for the right reason?** Is the extraction motivated
      by readability, reuse, or separation of concerns? Or did I extract it only because
      "I need to test it"?

- [ ] **Do my test files map to behaviors, not source files?** If I renamed an
      implementation file, would any test file need to be renamed too? If yes, the
      mapping is too tight.

- [ ] **Am I committing coverage theater?** Am I mocking the thing I am testing? Am I
      only asserting that a function was called without checking what it was called with?
      Am I testing trivial accessors? Am I only covering the happy path?

- [ ] **When coverage drops, am I asking the right question?** Am I asking "what business
      behavior is untested?" rather than "what line is uncovered?"

---

*Tests are not proof that your code works. They are proof that your code keeps its
promises. Write tests that verify promises, and they will serve you through every
refactor, every rewrite, and every 2 AM incident.*
