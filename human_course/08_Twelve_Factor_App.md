# Chapter 8: The Twelve-Factor App — Building for Production

## The Mental Model

Before we walk through individual factors, understand what the twelve-factor methodology actually is: a set of constraints that make your application *operationally boring*. Boring is the goal. Boring means your on-call engineer sleeps through the night. Boring means a new team member can deploy on their first day. Boring means scaling from one instance to fifty is a config change, not a rewrite.

These principles emerged from Heroku's experience running hundreds of thousands of production applications. They aren't academic theory — they're scar tissue from real outages, real data loss, and real 3 AM pages. Every factor addresses a specific class of failure that teams hit repeatedly when they ignore it.

The core insight is this: **your application is not a snowflake**. It should be deployable to any environment by changing only external configuration. It should scale horizontally by adding processes. It should start fast, shut down gracefully, and treat everything outside its own codebase as a replaceable, attached resource.

When you violate these principles, nothing breaks immediately. The violations are time bombs. Hardcoded config works fine until you need a staging environment. In-memory sessions work fine until you add a second instance behind a load balancer. Writing to local disk works fine until the container gets rescheduled to a different node. The twelve-factor methodology is about defusing these bombs before they're planted.

We won't cover all twelve factors with equal depth. Some are table stakes that TypeScript engineers already follow (like explicit dependency declaration). Others — config, statelessness, disposability — are where production applications live or die. We'll spend our time accordingly.

---

## Factor III: Config — The Most Important Factor

Config is everything that varies between environments: database URLs, API keys, feature flags, port numbers, external service endpoints. The rule is absolute: **store all config in environment variables**.

This is the factor most commonly violated, and the violations are the most dangerous. A hardcoded production database URL in source code is a security incident waiting to happen. An `if (process.env.NODE_ENV === 'production')` branch is a hidden environment coupling that makes your application behave differently in ways you can't test.

### The Bad Patterns

```typescript
// BAD: Hardcoded config
const DB_HOST = 'prod-db.internal.example.com';
const DB_PORT = 5432;
const API_KEY = 'sk-live-abc123def456';

// BAD: Environment-specific branching
function getDatabaseUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    return 'postgres://prod-db.internal:5432/myapp';
  } else if (process.env.NODE_ENV === 'staging') {
    return 'postgres://staging-db.internal:5432/myapp';
  } else {
    return 'postgres://localhost:5432/myapp_dev';
  }
}

// BAD: Reading process.env deep in the call tree
class UserRepository {
  async findById(id: string) {
    const client = new Pool({
      connectionString: process.env.DATABASE_URL,  // buried dependency
    });
    // ...
  }
}
```

Every one of these patterns creates a problem you won't discover until it hurts. The hardcoded credentials end up in git history. The environment branching means your "production" code path never runs in development. The buried `process.env` read means you can't test `UserRepository` without manipulating global state.

### The Good Pattern: Validate at Startup, Inject Everywhere

```typescript
// config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGIN: z.string().url(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(`Invalid configuration:\n${formatted}`);
    process.exit(1);
  }

  return result.data;
}
```

This pattern gives you three things. First, **fail-fast behavior**: if `DATABASE_URL` is missing, the process exits immediately on startup with a clear error message — not sixty seconds later when the first database query runs and produces a cryptic connection error. Second, **type safety**: the rest of your codebase works with a typed `Config` object, not `string | undefined`. Third, **a single point of contact with the environment**: `process.env` is read exactly once, in one file.

Now inject that config through options objects:

```typescript
// repository.ts
interface UserRepositoryOptions {
  databaseUrl: string;
}

export function createUserRepository(options: UserRepositoryOptions) {
  const pool = new Pool({ connectionString: options.databaseUrl });

  return {
    async findById(id: string): Promise<User | null> {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0] ?? null;
    },
  };
}

// main.ts
const config = loadConfig();
const userRepository = createUserRepository({ databaseUrl: config.DATABASE_URL });
```

`UserRepository` knows nothing about environment variables. It receives a database URL and uses it. You can test it by passing a test database URL. You can reuse it in a CLI tool, a migration script, or a different service. The dependency on external config is explicit and visible at the call site.

### Document Config with `.env.example`

Commit a `.env.example` file with every required variable and a comment explaining it. Never commit a `.env` file with real values.

```bash
# .env.example — Copy to .env and fill in values
PORT=3000
DATABASE_URL=              # PostgreSQL connection string
REDIS_URL=                 # Redis connection string
SESSION_SECRET=            # Minimum 32 characters
LOG_LEVEL=info             # debug | info | warn | error
CORS_ORIGIN=               # Allowed CORS origin URL
```

Add `.env` to your `.gitignore`. This is non-negotiable.

---

## Factor IV: Backing Services — Attached Resources

A backing service is anything your application consumes over the network: databases, message queues, caches, SMTP servers, third-party APIs. The twelve-factor rule is: **treat every backing service as an attached resource, identified by a URL in config**.

Your code should make no distinction between a PostgreSQL instance running on localhost, one running in your cloud provider's managed database service, and one running on a completely different infrastructure. The difference is the connection string, and the connection string lives in config.

```typescript
// The createApp pattern — all backing services injected via config
interface AppDependencies {
  config: Config;
  db: Pool;
  redis: RedisClient;
  emailService: EmailService;
}

export function createApp(deps: AppDependencies) {
  const app = express();

  app.get('/users/:id', async (req, res) => {
    const cached = await deps.redis.get(`user:${req.params.id}`);
    if (cached) return res.json(JSON.parse(cached));

    const result = await deps.db.query(
      'SELECT * FROM users WHERE id = $1',
      [req.params.id]
    );
    // ...
  });

  return app;
}
```

Swapping from a self-hosted Redis to a managed Redis cluster is a config change: update `REDIS_URL` and redeploy. No code changes. No pull request. No code review. The application is indifferent to where its backing services live.

This also means your tests can substitute backing services freely. Use a test database. Use an in-memory Redis mock. The application doesn't know and doesn't care.

---

## Factor VI: Stateless Processes — Nothing Survives a Restart

Twelve-factor processes are stateless and share-nothing. Any data that needs to persist must be stored in a backing service. This is the factor that most directly impacts how you write request handlers.

### The Bad Patterns

```typescript
// BAD: In-memory session store
const sessions = new Map<string, SessionData>();

app.use((req, res, next) => {
  const sessionId = req.cookies.sid;
  req.session = sessions.get(sessionId);
  next();
});

// BAD: Local filesystem for uploads
app.post('/upload', async (req, res) => {
  const file = req.files?.avatar;
  await fs.writeFile(`/tmp/uploads/${file.name}`, file.data);
  res.json({ path: `/tmp/uploads/${file.name}` });
});

// BAD: In-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}
```

These all work perfectly on a single instance. The moment you scale to two instances, sessions randomly vanish (the request hits the instance that doesn't have the session), uploaded files disappear (the next request hits a different instance), and cache hit rates collapse. When your single instance restarts — for a deploy, a crash, or a node rebalance — everything is gone.

### The Good Pattern: External State

```typescript
// GOOD: Redis-backed session store with schema validation
import { z } from 'zod';
import type { RedisClient } from './redis';

const SessionSchema = z.object({
  userId: z.string(),
  roles: z.array(z.string()),
  createdAt: z.string().datetime(),
});

type Session = z.infer<typeof SessionSchema>;

interface SessionStoreOptions {
  redis: RedisClient;
  ttlSeconds: number;
}

export function createSessionStore(options: SessionStoreOptions) {
  const { redis, ttlSeconds } = options;

  return {
    async get(sessionId: string): Promise<Session | null> {
      const raw = await redis.get(`session:${sessionId}`);
      if (!raw) return null;

      const result = SessionSchema.safeParse(JSON.parse(raw));
      if (!result.success) {
        await redis.del(`session:${sessionId}`);
        return null;
      }
      return result.data;
    },

    async set(sessionId: string, session: Session): Promise<void> {
      await redis.set(
        `session:${sessionId}`,
        JSON.stringify(session),
        'EX',
        ttlSeconds
      );
    },

    async destroy(sessionId: string): Promise<void> {
      await redis.del(`session:${sessionId}`);
    },
  };
}
```

For file uploads, use object storage (S3, GCS, or a compatible API) instead of the local filesystem. For caches, use Redis or Memcached. For job state, use a persistent queue. The pattern is always the same: any state that matters goes to a backing service.

The benefit goes beyond scaling. Stateless processes are **restartable by definition**. You can deploy new code by killing old processes and starting new ones with zero coordination. You can autoscale by adding instances that are immediately productive — they don't need to "warm up" a local cache or receive session data from peers.

---

## Factor IX: Disposability — Graceful Shutdown

Twelve-factor processes start fast and shut down gracefully. In a container orchestration environment, your process will be stopped and started constantly: deploys, scaling events, node maintenance, spot instance reclamation. Your application needs to handle this without dropping requests or corrupting data.

The operating system signals the process with SIGTERM. Your application has a finite window (typically 30 seconds in Kubernetes) to finish in-flight work before it receives SIGKILL.

### The Complete Shutdown Pattern

```typescript
import { createServer } from 'http';
import { Pool } from 'pg';
import type { RedisClient } from './redis';
import type { Config } from './config';

interface ServerDependencies {
  config: Config;
  db: Pool;
  redis: RedisClient;
  app: Express;
}

export async function startServer(deps: ServerDependencies) {
  const { config, db, redis, app } = deps;
  const server = createServer(app);

  // Health check endpoints
  app.get('/health', (_req, res) => {
    // Liveness: is the process running?
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    // Readiness: can this instance serve traffic?
    try {
      await db.query('SELECT 1');
      await redis.ping();
      res.status(200).json({ status: 'ready' });
    } catch (error) {
      res.status(503).json({ status: 'not ready', error: String(error) });
    }
  });

  // Start listening
  server.listen(config.PORT, () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Server started',
      context: { port: config.PORT },
    }));
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Shutdown initiated',
      context: { signal },
    }));

    // Stop accepting new connections
    server.close();

    // Force exit if graceful shutdown takes too long
    const forceTimeout = setTimeout(() => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Forced shutdown — drain timeout exceeded',
      }));
      process.exit(1);
    }, 15_000);

    forceTimeout.unref();

    try {
      // Close backing service connections
      await db.end();
      await redis.quit();

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Graceful shutdown complete',
      }));
      process.exit(0);
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Error during shutdown',
        context: { error: String(error) },
      }));
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
```

There are two health endpoints and they serve different purposes. `/health` is a **liveness** probe: "Is this process alive?" If it fails, the orchestrator kills and restarts the process. Keep it trivial — a 200 response is enough. `/ready` is a **readiness** probe: "Can this instance handle traffic?" It checks backing service connectivity. If it fails, the orchestrator stops routing traffic to this instance but does *not* kill it. This distinction matters during startup (the process is live but not yet ready) and during shutdown (you stop being ready before you stop being live).

The force timeout is critical. If a database connection hangs during shutdown, you don't want the process to hang forever. Set a timeout shorter than your orchestrator's grace period (e.g., 15 seconds when Kubernetes gives you 30), and force-exit if cleanup doesn't complete in time.

---

## Factor XI: Logs — Structured JSON to stdout

A twelve-factor application never concerns itself with routing or storage of its output stream. It writes structured events to stdout and lets the execution environment handle the rest. The platform (Kubernetes, ECS, a PaaS) collects stdout, routes it to a log aggregation service, and makes it searchable.

### The Bad Patterns

```typescript
// BAD: Unstructured console.log
console.log(`User ${userId} logged in from ${ip}`);
console.log('Database connection failed:', error.message);

// BAD: Writing to log files
import { appendFileSync } from 'fs';
appendFileSync('/var/log/app.log', `${new Date()} User ${userId} logged in\n`);

// BAD: Mixing concerns — log rotation, file management
import winston from 'winston';
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: '/var/log/app/error.log',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});
```

Unstructured logs are unsearchable. You cannot write a query to find "all login events for user X in the last hour" when your logs are free-form strings. Writing to files means your application is now responsible for disk space management, log rotation, and file permissions — none of which is its job.

### The Good Pattern: Structured JSON to stdout

```typescript
// logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
}

interface LoggerOptions {
  level: LogLevel;
  defaultContext?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(options: LoggerOptions) {
  const { level: minLevel, defaultContext } = options;

  function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...defaultContext, ...context },
    };

    const output = level === 'error' ? process.stderr : process.stdout;
    output.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
    info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
    warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
    error: (message: string, context?: Record<string, unknown>) => log('error', message, context),

    child(childContext: Record<string, unknown>) {
      return createLogger({
        level: minLevel,
        defaultContext: { ...defaultContext, ...childContext },
      });
    },
  };
}
```

Use the `child` method to create request-scoped loggers with a correlation ID:

```typescript
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string ?? crypto.randomUUID();
  req.log = logger.child({ requestId, method: req.method, path: req.path });
  req.log.info('Request received');
  next();
});
```

Now every log entry from a single request shares a `requestId`. When investigating an issue, you query your log aggregation service for that ID and get the complete story of that request across every service it touched.

---

## Factor II: Dependencies — Explicit Declaration

Every dependency must be explicitly declared in `package.json` and pinned via a committed lockfile (`package-lock.json` or `pnpm-lock.yaml`). There are no implicit dependencies on system tools, globally installed packages, or "it works on my machine" assumptions.

```jsonc
// package.json — be explicit
{
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/express": "^4.17.21",
    "@types/pg": "^8.10.9"
  }
}
```

The `engines` field documents the required Node.js version. The lockfile ensures that every developer and every CI/CD pipeline installs the exact same dependency tree. If your build requires a system tool (like `sharp` needing `libvips`), declare it in your Dockerfile or build documentation — don't assume it exists.

Commit your lockfile. Always.

---

## Factor X: Dev/Prod Parity — Keep the Gap Small

The twelve-factor developer resists the urge to use different backing services between development and production. If production uses PostgreSQL, develop against PostgreSQL. If production uses Redis, develop against Redis. Not SQLite. Not an in-memory fake. The real thing.

The reasoning is straightforward: SQLite and PostgreSQL have different SQL dialects, different type systems, different concurrency behavior, and different failure modes. A query that works perfectly against SQLite may fail or behave differently against PostgreSQL. You want to discover that at development time, not during a production deploy.

Docker Compose makes this trivial:

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

```bash
# .env (local development only, never committed)
DATABASE_URL=postgres://dev:dev@localhost:5432/myapp_dev
REDIS_URL=redis://localhost:6379
```

One `docker compose up -d` and you have production-equivalent backing services running locally. Your application code is identical in development and production — only the config values differ. This is the twelve-factor ideal.

---

## Factor VIII: Concurrency — Scale via the Process Model

Twelve-factor applications scale horizontally by running multiple processes, not by making a single process larger. Different types of work run as different process types.

```typescript
// src/entrypoints/web.ts — handles HTTP requests
import { loadConfig } from '../config';
import { createApp } from '../app';
import { startServer } from '../server';

async function main() {
  const config = loadConfig();
  const deps = await initializeDependencies(config);
  const app = createApp(deps);
  await startServer({ ...deps, app, config });
}

main();
```

```typescript
// src/entrypoints/worker.ts — processes background jobs
import { loadConfig } from '../config';

async function main() {
  const config = loadConfig();
  const deps = await initializeDependencies(config);

  const queue = createQueueConsumer({
    redis: deps.redis,
    handlers: {
      'email.send': createEmailHandler(deps),
      'report.generate': createReportHandler(deps),
    },
  });

  await queue.start();

  // Same graceful shutdown pattern
  const shutdown = async (signal: string) => {
    deps.logger.info('Worker shutdown initiated', { signal });
    await queue.stop();
    await deps.db.end();
    await deps.redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
```

Both entrypoints share the same application code, config loading, and dependency initialization. They differ only in what they do with those dependencies. The web process serves HTTP. The worker process consumes jobs. To handle more HTTP traffic, run more web processes. To process jobs faster, run more worker processes. The scaling decisions are independent.

This maps directly to container orchestration. In Kubernetes, each process type is a separate Deployment with its own replica count. In a Procfile-based platform:

```
web: node dist/entrypoints/web.js
worker: node dist/entrypoints/worker.js
```

---

## Testing These Patterns

Every pattern in this chapter is directly testable. This is not a coincidence — testability and twelve-factor compliance reinforce each other.

### Config Validation Is Testable

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('fails when DATABASE_URL is missing', () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    // loadConfig calls process.exit(1) on failure,
    // so we test the schema directly
    const result = ConfigSchema.safeParse(process.env);
    expect(result.success).toBe(false);

    process.env.DATABASE_URL = original;
  });

  it('coerces PORT to a number', () => {
    const result = ConfigSchema.safeParse({
      ...validEnv,
      PORT: '8080',
    });
    expect(result.success).toBe(true);
    expect(result.data?.PORT).toBe(8080);
  });
});
```

### Shutdown Behavior Is Testable

```typescript
import { describe, it, expect } from 'vitest';

describe('graceful shutdown', () => {
  it('closes database pool on SIGTERM', async () => {
    const mockPool = { end: vi.fn().mockResolvedValue(undefined) };
    const mockRedis = { quit: vi.fn().mockResolvedValue(undefined) };

    const server = await startServer({
      config: testConfig,
      db: mockPool as unknown as Pool,
      redis: mockRedis as unknown as RedisClient,
      app: express(),
    });

    // Simulate SIGTERM
    process.emit('SIGTERM', 'SIGTERM');

    // Allow async shutdown to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPool.end).toHaveBeenCalled();
    expect(mockRedis.quit).toHaveBeenCalled();
  });
});
```

### Statelessness Is Testable by Construction

When state lives in an injected backing service, you test it by injecting a test instance of that service. A `createSessionStore({ redis: testRedis })` call gives you a session store backed by a test Redis instance. No global state to set up or tear down. No `process.env` to manipulate.

### Config Injection Makes Everything Testable

This is the deeper point. The `createApp(deps)` pattern means your entire application is a function of its dependencies. In tests, you supply test dependencies. In production, you supply real ones. The application doesn't know the difference and doesn't need to.

```typescript
it('returns 503 when database is unreachable', async () => {
  const brokenPool = {
    query: vi.fn().mockRejectedValue(new Error('Connection refused')),
  };

  const app = createApp({
    config: testConfig,
    db: brokenPool as unknown as Pool,
    redis: testRedis,
    emailService: mockEmailService,
  });

  const response = await supertest(app).get('/ready');
  expect(response.status).toBe(503);
});
```

---

## Summary Checklist

Use this checklist when reviewing code or setting up a new service.

### Config (Factor III)
- [ ] All configuration loaded from environment variables
- [ ] Config validated at startup with a schema (Zod)
- [ ] Application exits immediately if required config is missing
- [ ] `process.env` accessed in exactly one place (`loadConfig`)
- [ ] Config injected via options objects, never read from `process.env` in business logic
- [ ] `.env.example` committed with documentation; `.env` in `.gitignore`

### Backing Services (Factor IV)
- [ ] Every backing service identified by a URL in config
- [ ] No code distinction between local and remote services
- [ ] Swapping a backing service requires only a config change

### Stateless Processes (Factor VI)
- [ ] No in-memory session state (`Map`, module-level variables)
- [ ] No local filesystem writes for persistent data
- [ ] Sessions, caches, and uploads stored in backing services

### Disposability (Factor IX)
- [ ] SIGTERM and SIGINT handlers registered
- [ ] Drain timeout with forced exit if shutdown hangs
- [ ] Database pools, Redis connections, and queue consumers closed on shutdown
- [ ] `/health` endpoint for liveness probes
- [ ] `/ready` endpoint checking backing service connectivity

### Logs (Factor XI)
- [ ] Structured JSON written to stdout/stderr
- [ ] No file-based logging, no log rotation in application code
- [ ] Every log entry includes timestamp, level, and message
- [ ] Request correlation ID propagated through child loggers

### Dependencies (Factor II)
- [ ] All dependencies in `package.json`
- [ ] Lockfile committed to version control
- [ ] `engines` field specifying required Node.js version

### Dev/Prod Parity (Factor X)
- [ ] Same backing service types in development and production
- [ ] Docker Compose for local backing services
- [ ] No SQLite-in-dev, PostgreSQL-in-prod substitutions

### Concurrency (Factor VIII)
- [ ] Separate entrypoints for web and worker process types
- [ ] Shared application code, different entry functions
- [ ] Each process type independently scalable

### Testing
- [ ] Config validation covered by unit tests
- [ ] Shutdown behavior covered by tests
- [ ] All dependencies injectable — no hidden coupling to `process.env` or global state
- [ ] `createApp(deps)` pattern enables full integration tests with controlled dependencies
