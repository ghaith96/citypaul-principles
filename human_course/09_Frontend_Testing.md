# Chapter 9: Front-End Testing — Real Browsers, Real Confidence

## The Mental Model

Here is the uncomfortable truth about most front-end test suites: they run in a
fake browser. They pass in CI. And they tell you almost nothing about whether your
UI actually works.

For years, the standard approach has been to render React components inside jsdom —
a JavaScript reimplementation of the DOM that runs in Node.js. It is fast. It is
convenient. And it is a lie. Not a malicious lie, but a structural one: jsdom
simulates *some* of what a browser does, and the gaps between "some" and "all" are
exactly where your production bugs live.

This chapter is about closing that gap. We will move your tests into a real browser,
use queries that mirror how humans and assistive technology actually interact with
your UI, and adopt patterns that give you genuine confidence rather than the illusion
of it.

The core principle is simple: **the more your tests resemble the way your software is
used, the more confidence they can give you.** That is not my insight — it is Kent C.
Dodds', and it is the single most important idea in front-end testing.

---

## 1. Why jsdom Is a Lie

jsdom is a pure-JavaScript implementation of the WHATWG DOM and HTML standards. It
runs in Node.js. It does not have a rendering engine, a layout engine, or a compositor.
It does not paint pixels. Here is what that means in practice:

| Capability | Real Browser | jsdom |
|---|---|---|
| CSS rendering | Full | None — `getComputedStyle` returns empty or wrong values |
| Layout (`offsetWidth`, `getBoundingClientRect`) | Accurate | Returns zeroes |
| `IntersectionObserver` | Native | Not implemented |
| `ResizeObserver` | Native | Not implemented |
| Clipboard API | Native | Not implemented |
| Focus management | Full tab-order, `:focus-visible` | Partial, no visual distinction |
| `<dialog>` element | Full (top-layer, inert backdrop) | Partial, no top-layer |
| Real event bubbling/capturing | Complete | Simulated, subtle differences |
| Navigation (`window.location`) | Full | Throws or no-ops |

Every one of those gaps is a category of bug that your jsdom tests *cannot catch*.
You have seen this before: a dropdown menu test passes perfectly in CI, but in
production the menu renders behind a modal because jsdom never computed `z-index`.
A visibility toggle test passes, but in the real browser the element is hidden by
`overflow: hidden` on a parent — something jsdom has no concept of.

The worst part is not that these tests fail to catch bugs. It is that they give you
**false confidence**. A green test suite that cannot detect an entire class of defects
is worse than no tests at all, because it discourages manual verification.

```typescript
// This test passes in jsdom. It lies to you.
it('hides the tooltip when the user scrolls away', () => {
  render(<Tooltip content="Help text" />);
  const trigger = screen.getByRole('button');
  fireEvent.mouseEnter(trigger);

  expect(screen.getByText('Help text')).toBeVisible();

  // In a real browser, scrolling moves the tooltip out of the viewport.
  // In jsdom, "visible" just means "exists in the DOM and has no
  // display:none / visibility:hidden / hidden attribute."
  // jsdom cannot compute viewport intersection.
  fireEvent.scroll(window, { target: { scrollY: 1000 } });

  // This assertion PASSES in jsdom because jsdom has no concept of
  // viewport visibility. It will FAIL in production.
  expect(screen.getByText('Help text')).not.toBeVisible();
});
```

The fix is not to write more clever jsdom tests. The fix is to stop running tests
in a fake browser.

---

## 2. Vitest Browser Mode — The Better Way

Vitest Browser Mode runs your tests inside a real browser via Playwright. Your test
code ships to an actual Chromium (or Firefox, or WebKit) instance. CSS is rendered.
Events go through the browser's real event pipeline. Every API that exists in a
browser exists in your test.

### Setup

Install the integration:

```bash
npm install -D @vitest/browser vitest @vitest/browser-playwright playwright
```

Configure Vitest:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
});
```

That is it. Your existing tests run in a real browser now. No test rewrites needed
for the basic case.

### What You Get

- **Real CSS rendering.** `toBeVisible()` actually checks computed visibility, not
  just DOM attributes.
- **Real events via CDP.** Click events go through the browser's input pipeline:
  hover, pointerdown, focus, pointerup, click — the full sequence.
- **Full browser API surface.** `IntersectionObserver`, `ResizeObserver`, Clipboard,
  `<dialog>`, Web Animations — all real.
- **Real focus management.** Tab order, `:focus-visible`, focus trapping — all
  verifiable.
- **Built-in locators.** Vitest Browser Mode ships with locators that mirror Testing
  Library queries. No separate `@testing-library/react` import needed.

```typescript
// Vitest Browser Mode — locators are built in
import { page } from '@vitest/browser/context';

it('submits the contact form', async () => {
  // These locators work like Testing Library, but they are native to Vitest
  await page.getByRole('textbox', { name: /email/i }).fill('user@example.com');
  await page.getByRole('textbox', { name: /message/i }).fill('Hello');
  await page.getByRole('button', { name: /send/i }).click();

  await expect.element(page.getByText(/thank you/i)).toBeVisible();
});
```

---

## 3. The Two Users of Your UI

Every component has two users:

1. **The end-user** — a human (or screen reader) interacting through the rendered
   DOM. They click buttons, type into fields, read text. They do not know or care
   about your component's internal state, your Redux store, or your CSS class names.

2. **The developer** — you, six months from now, refactoring the component. You will
   rename CSS classes, restructure JSX, swap a `useState` for a `useReducer`. You
   need the tests to stay green through all of that, as long as behavior is preserved.

The way you query elements in your tests determines which user you are testing for.
If you query by CSS class (`.submit-btn`), you are testing for *neither* user — you
are testing implementation structure. The end-user does not see class names. The
developer will rename them.

If you query by role and accessible name (`getByRole('button', { name: /submit/i })`),
you are testing for *both* users simultaneously. The end-user interacts with a button
labeled "Submit." The developer can restyle, restructure, and refactor everything
about that button — as long as it remains a button with that label, the test holds.

This is not a style preference. This is a mechanical property of the query strategy.
Role-based queries are the *only* strategy that serves both users.

---

## 4. Accessibility-First Query Selection

The priority order is not arbitrary. It follows how users actually find elements on
a page, from most universal to most implementation-coupled.

### Priority 1: `getByRole` — Highest Priority

`getByRole` queries the accessibility tree — the same structure that screen readers,
voice control, and browser features use. If your element cannot be found by role, it
is invisible to assistive technology, which means it has an accessibility defect.

```tsx
// Bad: queries implementation details
const button = container.querySelector('.submit-button');
const button = page.getByTestId('submit-button');

// Good: queries what the user perceives
const button = page.getByRole('button', { name: /submit order/i });
```

Common roles and when to use them:

| Role | Elements | Example |
|---|---|---|
| `button` | `<button>`, `<input type="submit">`, `[role="button"]` | `getByRole('button', { name: /save/i })` |
| `textbox` | `<input type="text">`, `<textarea>` | `getByRole('textbox', { name: /email/i })` |
| `checkbox` | `<input type="checkbox">` | `getByRole('checkbox', { name: /agree/i })` |
| `heading` | `<h1>`–`<h6>` | `getByRole('heading', { level: 2, name: /settings/i })` |
| `link` | `<a href="...">` | `getByRole('link', { name: /documentation/i })` |
| `dialog` | `<dialog>`, `[role="dialog"]` | `getByRole('dialog', { name: /confirm/i })` |
| `alert` | `[role="alert"]` | `getByRole('alert')` |

### Priority 2: `getByLabelText` — Form Fields

When a form input has a visible `<label>`, `getByLabelText` is the natural query. It
verifies the label-input association is correct, which is itself an accessibility
requirement.

```tsx
// Good: verifies the label association works
const emailInput = page.getByLabelText(/email address/i);
```

### Priority 3: `getByText` — Non-Interactive Content

For static text — paragraphs, list items, error messages — `getByText` is appropriate.

```tsx
// Good: finding a status message
await expect.element(page.getByText(/payment successful/i)).toBeVisible();
```

### Priority 4: `getByPlaceholderText` — When No Label Exists

If your input has no visible label (a search box with only a placeholder, for instance),
this is acceptable. But consider: if there is no label, you likely have an accessibility
issue to fix.

### Last Resort: `getByTestId`

`data-testid` attributes exist solely for testing. The end-user does not see them. They
are invisible to assistive technology. They survive refactoring *only* because someone
remembers to keep them, which someone eventually will not.

Use `getByTestId` when:
- The element has no accessible name and *cannot* reasonably have one (rare)
- You are testing a low-level visualization (canvas, SVG chart)
- You have exhausted every other option

```tsx
// Acceptable: a dynamic chart with no semantic label
const chart = page.getByTestId('revenue-chart');

// Not acceptable: there IS a semantic way to find this
const button = page.getByTestId('submit-button'); // Use getByRole instead
```

### The Diagnostic Insight

Here is the most powerful property of accessibility-first queries: **when your test
cannot find an element, your app has an accessibility bug.** The test failure is doing
double duty — it protects behavior *and* accessibility simultaneously. No other query
strategy gives you that.

---

## 5. `userEvent` Over `fireEvent`

`fireEvent` dispatches a single synthetic DOM event. `userEvent` simulates the
complete interaction sequence a real user produces.

When a real user clicks a button, the browser fires: `pointerover` → `pointerenter` →
`pointermove` → `pointerdown` → `focus` → `pointerup` → `click`. A `fireEvent.click()`
fires exactly one of those events. If your component's behavior depends on `focus`
(and many do — think focus rings, focus trapping in modals), `fireEvent` will miss it.

### The jsdom + fireEvent Trap

```tsx
// Bad: fires a single synthetic event, skips the full interaction chain
import { fireEvent } from '@testing-library/react';

fireEvent.change(input, { target: { value: 'test@example.com' } });
fireEvent.click(submitButton);
```

This code sets the input's value property directly and fires a single `change` event.
A real user would: click the input (focus), type each character (keydown, keypress,
input, keyup for each), then tab or click away (blur, change). If your component
validates on `input` events, on `blur`, or debounces keystrokes, the `fireEvent`
version will not exercise that logic.

### The Browser Mode Way

In Vitest Browser Mode, locators have built-in interaction methods that use CDP
(Chrome DevTools Protocol) to drive real browser input:

```tsx
// Good: real browser interactions via locator methods
import { page } from '@vitest/browser/context';

await page.getByLabelText(/email/i).fill('test@example.com');
await page.getByRole('button', { name: /submit/i }).click();
```

`.fill()` clears the field and types the text character by character through the
browser's input pipeline. `.click()` moves the pointer and fires the complete
click sequence. Focus, blur, input, change — all real.

### The `userEvent` Alternative

If you need finer control, Vitest Browser Mode also provides `userEvent`:

```tsx
import { userEvent } from '@vitest/browser/context';

// Types character by character, firing all intermediate events
await userEvent.fill(page.getByLabelText(/email/i), 'test@example.com');

// Full keyboard interaction
await userEvent.keyboard('{Tab}');

// Drag and drop
await userEvent.dragAndDrop(
  page.getByText(/item 1/i),
  page.getByText(/drop zone/i),
);
```

---

## 6. Auto-Retrying Assertions with `expect.element()`

UI updates are asynchronous. A click triggers a state update, React re-renders, and
the DOM changes — but not synchronously. In jsdom-land, this is where `act()` and
`waitFor` come in, and they are the source of enormous frustration.

Vitest Browser Mode solves this with `expect.element()`, which automatically retries
the assertion until it passes or a timeout is reached:

```tsx
import { page } from '@vitest/browser/context';

// This will retry until the element appears or the test times out.
// No act(), no waitFor, no manual retries.
await expect.element(page.getByText(/order confirmed/i)).toBeVisible();

// Negation works too — retries until the element is gone
await expect.element(page.getByText(/loading/i)).not.toBeInTheDocument();

// Check attributes
await expect.element(page.getByRole('button', { name: /submit/i })).toBeDisabled();

// Check input values
await expect.element(page.getByLabelText(/email/i)).toHaveValue('test@example.com');
```

### Why This Is Better Than `waitFor`

```tsx
// jsdom approach: manual retrying with waitFor
await waitFor(() => {
  expect(screen.getByText(/order confirmed/i)).toBeVisible();
});

// Browser Mode approach: auto-retrying built in
await expect.element(page.getByText(/order confirmed/i)).toBeVisible();
```

The mechanical difference is small. The cognitive difference is large. `waitFor` is
something you have to *remember* to use, and when you forget, you get a flaky test.
`expect.element()` makes retrying the default. You cannot forget to use it because it
is the only way assertions work.

### Configuring Timeouts

```tsx
// Override timeout for a slow operation
await expect.element(
  page.getByText(/report generated/i),
  { timeout: 10_000 },
).toBeVisible();
```

---

## 7. MSW for API Mocking

Your front-end tests need to control API responses. The question is *where* to
intercept.

### The Wrong Way: Mocking `fetch`

```tsx
// Bad: tightly coupled to the fetch implementation
vi.spyOn(global, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ users: [{ id: 1, name: 'Alice' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
);
```

This breaks when:
- You switch from `fetch` to `axios` (or the reverse)
- A library makes its own `fetch` calls you did not anticipate
- You add request middleware or interceptors
- You need to test retry logic, because the mock does not go through the network stack

### The Right Way: MSW (Mock Service Worker)

MSW intercepts at the *network* level. Your application code makes a real `fetch` call.
MSW intercepts it before it leaves the browser and returns your mock response. The
application cannot tell the difference between MSW and a real server.

```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json({
      users: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ],
    });
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: 3, ...body },
      { status: 201 },
    );
  }),

  http.delete('/api/users/:id', ({ params }) => {
    return HttpResponse.json({ deleted: params.id });
  }),
];
```

```typescript
// src/mocks/server.ts (for tests)
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

```typescript
// vitest.setup.ts
import { server } from './src/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

The `onUnhandledRequest: 'error'` option is critical. It means any API call your test
makes that does *not* have a handler will throw an error. This catches unintended
network requests immediately rather than letting them silently fail or hit a real
server.

### Per-Test Overrides

Your default handlers cover the happy path. Individual tests override for specific
scenarios:

```tsx
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { page } from '@vitest/browser/context';

it('shows an error message when the API returns 500', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }),
  );

  // render component, interact, assert...
  await expect.element(page.getByRole('alert')).toHaveTextContent(
    /something went wrong/i,
  );
});

it('shows empty state when there are no users', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json({ users: [] });
    }),
  );

  await expect.element(page.getByText(/no users found/i)).toBeVisible();
});
```

### The Portability Benefit

The same MSW handlers work in:
- **Tests** (this chapter)
- **Storybook** (component development)
- **Local development** (frontend without a backend)

Write the mock once, use it everywhere. When the API contract changes, you update
one set of handlers.

---

## 8. React-Specific Patterns

Vitest Browser Mode has a dedicated React integration: `vitest-browser-react`.

```bash
npm install -D vitest-browser-react
```

### `render()` Is Async

Unlike `@testing-library/react`, the `render()` in `vitest-browser-react` is
asynchronous and returns a scoped `screen` object:

```tsx
import { render } from 'vitest-browser-react';
import { UserProfile } from './UserProfile';

it('displays the user name', async () => {
  const { getByRole, getByText } = await render(
    <UserProfile userId="123" />,
  );

  await expect.element(getByRole('heading', { name: /alice/i })).toBeVisible();
  await expect.element(getByText(/alice@example.com/i)).toBeVisible();
});
```

The scoped return value (`getByRole`, `getByText`, etc.) is bound to the rendered
component's container. This is cleaner than a global `screen` object when you have
multiple render calls in a test file.

### `renderHook()` for Custom Hooks

```tsx
import { renderHook } from 'vitest-browser-react';
import { useCounter } from './useCounter';

it('increments the counter', async () => {
  const { result } = await renderHook(() => useCounter(0));

  expect(result.current.count).toBe(0);

  result.current.increment();

  expect(result.current.count).toBe(1);
});
```

### Context Providers via `wrapper`

```tsx
import { render } from 'vitest-browser-react';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider } from './AuthContext';
import { Dashboard } from './Dashboard';

const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme="dark">
    <AuthProvider user={{ id: '1', name: 'Alice' }}>
      {children}
    </AuthProvider>
  </ThemeProvider>
);

it('renders the dashboard in dark mode', async () => {
  const { getByRole } = await render(<Dashboard />, {
    wrapper: AllProviders,
  });

  await expect.element(getByRole('main')).toBeVisible();
});
```

### No Manual `act()` or `cleanup()`

In Browser Mode:
- **`act()` is unnecessary.** The browser handles update batching natively. There is
  no artificial synchronous rendering to wrap.
- **`cleanup()` is automatic.** Each test gets a clean DOM. You do not need
  `afterEach(cleanup)`.

If you find yourself reaching for `act()` in Browser Mode, stop. You are fighting the
framework. The browser already handles what `act()` was designed to simulate.

---

## 9. Test Idempotency

An idempotent test produces the same result regardless of:
- Which tests ran before it
- Which tests run after it
- How many times it runs
- Whether it runs in parallel with other tests

This is not a nice-to-have. It is a prerequisite for a trustworthy test suite.

### The Problem: Shared State

```tsx
// Bad: tests depend on shared state
let user: User;

beforeAll(async () => {
  user = await createUser({ name: 'Alice' });
});

it('displays the user name', async () => {
  const { getByText } = await render(<UserCard user={user} />);
  await expect.element(getByText(/alice/i)).toBeVisible();
});

it('updates the user name', async () => {
  // This test MUTATES the shared user object.
  // If it runs before the previous test, that test fails.
  user.name = 'Bob';
  const { getByText } = await render(<UserCard user={user} />);
  await expect.element(getByText(/bob/i)).toBeVisible();
});
```

### The Fix: Each Test Creates Its Own World

```tsx
// Good: each test is self-contained
function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: crypto.randomUUID(),
    name: 'Alice',
    email: 'alice@example.com',
    ...overrides,
  };
}

it('displays the user name', async () => {
  const user = createTestUser({ name: 'Alice' });
  const { getByText } = await render(<UserCard user={user} />);
  await expect.element(getByText(/alice/i)).toBeVisible();
});

it('displays a different user name', async () => {
  const user = createTestUser({ name: 'Bob' });
  const { getByText } = await render(<UserCard user={user} />);
  await expect.element(getByText(/bob/i)).toBeVisible();
});
```

### Unique Identifiers for Parallel Safety

When tests run in parallel and interact with shared external state (a mock API, local
storage, a database), use unique identifiers to prevent collisions:

```tsx
it('creates a new project', async () => {
  const projectName = `test-project-${crypto.randomUUID()}`;

  server.use(
    http.post('/api/projects', async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json({ id: '1', name: body.name }, { status: 201 });
    }),
  );

  const { getByRole, getByLabelText } = await render(<CreateProjectForm />);

  await getByLabelText(/project name/i).fill(projectName);
  await getByRole('button', { name: /create/i }).click();

  await expect.element(
    getByRole('heading', { name: new RegExp(projectName, 'i') }),
  ).toBeVisible();
});
```

---

## 10. Anti-Patterns Catalog

### Anti-Pattern 1: Using `querySelector`

```tsx
// Bad: couples test to DOM structure and CSS classes
const button = container.querySelector('.btn-primary.submit');
const items = container.querySelectorAll('.list-item');
```

Why it is bad: CSS classes are styling concerns. They change when you redesign. They
tell you nothing about what the element *does*. They are invisible to users.

```tsx
// Good: queries by role and accessible name
const button = page.getByRole('button', { name: /submit/i });
```

### Anti-Pattern 2: `beforeEach` Render Pattern

```tsx
// Bad: renders once, all tests share the result
let result: RenderResult;

beforeEach(async () => {
  result = await render(<UserDashboard />);
});

it('shows the user name', async () => { /* uses result */ });
it('shows the settings link', async () => { /* uses result */ });
```

Why it is bad: tests are coupled through `result`. If one test interacts with the
component (clicks, types), it modifies the DOM for subsequent tests. Debugging
failures requires understanding the *order* of test execution.

```tsx
// Good: factory function, each test renders fresh
function renderDashboard(props: Partial<DashboardProps> = {}) {
  return render(<UserDashboard user={createTestUser()} {...props} />);
}

it('shows the user name', async () => {
  const { getByRole } = await renderDashboard();
  await expect.element(getByRole('heading', { name: /alice/i })).toBeVisible();
});

it('shows the settings link', async () => {
  const { getByRole } = await renderDashboard();
  await expect.element(getByRole('link', { name: /settings/i })).toBeVisible();
});
```

### Anti-Pattern 3: Multiple Assertions in `waitFor`

```tsx
// Bad: if the first assertion fails, waitFor retries ALL of them
await waitFor(() => {
  expect(screen.getByText(/alice/i)).toBeVisible();
  expect(screen.getByText(/bob/i)).toBeVisible();
  expect(screen.getByText(/charlie/i)).toBeVisible();
});
```

Why it is bad: `waitFor` retries the entire callback. If "alice" appears but "bob"
does not, `waitFor` retries from the top — including rechecking "alice" — until it
times out. The error message only tells you the *last* failure, making debugging
harder.

```tsx
// Good: one assertion per await (Browser Mode auto-retries each)
await expect.element(page.getByText(/alice/i)).toBeVisible();
await expect.element(page.getByText(/bob/i)).toBeVisible();
await expect.element(page.getByText(/charlie/i)).toBeVisible();
```

### Anti-Pattern 4: Side Effects in `waitFor`

```tsx
// Bad: the click fires on EVERY retry
await waitFor(async () => {
  await userEvent.click(button);
  expect(screen.getByText(/saved/i)).toBeVisible();
});
```

Why it is bad: `waitFor` retries the callback repeatedly. The button gets clicked
dozens of times. If the handler is not idempotent (and most are not), you get
unpredictable behavior.

```tsx
// Good: perform the action once, then wait for the result
await page.getByRole('button', { name: /save/i }).click();
await expect.element(page.getByText(/saved/i)).toBeVisible();
```

### Anti-Pattern 5: Wrapping `findBy` in `waitFor`

```tsx
// Bad: redundant — findBy already waits
await waitFor(() => {
  screen.findByText(/loaded/i);
});
```

`findBy` queries are already async and retry internally. Wrapping them in `waitFor`
adds nothing except confusion. In Browser Mode, use `expect.element()` instead.

### Anti-Pattern 6: Exact String Matching

```tsx
// Bad: brittle — breaks if capitalization, whitespace, or wording changes
page.getByText('Submit Order');
page.getByRole('button', { name: 'Submit Order' });
```

```tsx
// Good: regex is resilient to minor text changes
page.getByText(/submit order/i);
page.getByRole('button', { name: /submit order/i });
```

The `/i` flag makes the match case-insensitive. The regex also allows partial
matching by default, so `Submit Your Order` would still match `/submit order/i`.

### Anti-Pattern 7: Testing Implementation State

```tsx
// Bad: asserts on internal state, not user-visible behavior
it('adds item to cart', async () => {
  const { result } = await renderHook(() => useCart());
  result.current.addItem({ id: '1', name: 'Widget' });
  expect(result.current.items).toHaveLength(1); // Testing internals
});
```

```tsx
// Good: asserts on what the user sees
it('adds item to cart', async () => {
  const { getByRole, getByText } = await render(<ProductPage />);

  await getByRole('button', { name: /add to cart/i }).click();

  await expect.element(getByText(/1 item in cart/i)).toBeVisible();
});
```

---

## Putting It All Together: A Complete Test

Here is a full test for a user management page. It demonstrates every pattern
from this chapter:

```tsx
// user-management.browser-test.tsx
import { render } from 'vitest-browser-react';
import { page } from '@vitest/browser/context';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { UserManagement } from './UserManagement';
import { AppProviders } from '../test-utils/providers';

function renderUserManagement() {
  return render(<UserManagement />, { wrapper: AppProviders });
}

describe('UserManagement', () => {
  it('displays the list of users', async () => {
    const { getByRole, getByText } = await renderUserManagement();

    await expect.element(getByRole('heading', { name: /users/i })).toBeVisible();
    await expect.element(getByText(/alice/i)).toBeVisible();
    await expect.element(getByText(/bob/i)).toBeVisible();
  });

  it('shows an error state when the API fails', async () => {
    server.use(
      http.get('/api/users', () => {
        return HttpResponse.json(
          { error: 'Server error' },
          { status: 500 },
        );
      }),
    );

    const { getByRole } = await renderUserManagement();

    await expect.element(getByRole('alert')).toHaveTextContent(
      /failed to load users/i,
    );
  });

  it('adds a new user via the form', async () => {
    const newUserName = `test-user-${crypto.randomUUID().slice(0, 8)}`;

    server.use(
      http.post('/api/users', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(
          { id: crypto.randomUUID(), ...body },
          { status: 201 },
        );
      }),
    );

    const { getByRole, getByLabelText } = await renderUserManagement();

    // Open the add-user form
    await getByRole('button', { name: /add user/i }).click();

    // Fill out the form
    await getByLabelText(/full name/i).fill(newUserName);
    await getByLabelText(/email/i).fill(`${newUserName}@example.com`);

    // Submit
    await getByRole('button', { name: /save/i }).click();

    // Verify the new user appears in the list
    await expect.element(
      page.getByText(new RegExp(newUserName, 'i')),
    ).toBeVisible();
  });

  it('deletes a user after confirmation', async () => {
    server.use(
      http.delete('/api/users/:id', () => {
        return HttpResponse.json({ success: true });
      }),
    );

    const { getByRole } = await renderUserManagement();

    // Wait for users to load
    await expect.element(page.getByText(/alice/i)).toBeVisible();

    // Click delete on Alice's row
    const aliceRow = page.getByRole('row', { name: /alice/i });
    await aliceRow.getByRole('button', { name: /delete/i }).click();

    // Confirm in the dialog
    await getByRole('dialog', { name: /confirm/i })
      .getByRole('button', { name: /yes, delete/i })
      .click();

    // Alice should be gone
    await expect.element(page.getByText(/alice/i)).not.toBeInTheDocument();
  });
});
```

Notice what this test does *not* do:
- No `querySelector`
- No `data-testid`
- No `act()`
- No `waitFor`
- No `fireEvent`
- No `fetch` mocking
- No shared mutable state between tests

Every test creates its own state, queries by accessibility semantics, uses real
browser interactions, and asserts on user-visible outcomes.

---

## Summary Checklist

Use this as a quick reference when writing or reviewing front-end tests.

### Environment
- [ ] Tests run in Vitest Browser Mode, not jsdom
- [ ] Browser provider is configured (`@vitest/browser-playwright`)
- [ ] MSW is set up for network mocking with `onUnhandledRequest: 'error'`

### Queries
- [ ] `getByRole` is the default query
- [ ] `getByLabelText` is used for form fields
- [ ] `getByText` is used for non-interactive text content
- [ ] `getByTestId` is used only as a last resort, with a comment explaining why
- [ ] No `querySelector` or class-based selectors
- [ ] Regex patterns used instead of exact strings (with `/i` flag)

### Interactions
- [ ] Locator methods (`.click()`, `.fill()`) or `userEvent` used for all interactions
- [ ] No `fireEvent` usage
- [ ] No side effects inside `waitFor` callbacks

### Assertions
- [ ] `expect.element()` used for all DOM assertions (auto-retrying)
- [ ] No manual `act()` wrapping
- [ ] One assertion per `waitFor` call (if `waitFor` is used at all)
- [ ] Assertions verify user-visible outcomes, not internal state

### Test Structure
- [ ] Each test is self-contained — no shared mutable state
- [ ] Factory functions used instead of `beforeEach` render
- [ ] Unique identifiers used for data that could collide in parallel runs
- [ ] MSW handlers reset after each test (`server.resetHandlers()`)
- [ ] Per-test API overrides use `server.use()`, not handler mutation

### What Not To Do
- [ ] No `container.querySelector`
- [ ] No `beforeEach` render shared across tests
- [ ] No multiple assertions inside `waitFor`
- [ ] No `findBy` wrapped in `waitFor`
- [ ] No implementation state assertions (hook return values, store contents)
- [ ] No `vi.spyOn(global, 'fetch')` — use MSW instead
