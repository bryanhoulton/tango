# Deployed Test Concepts

These are end-to-end test concepts for a TypeScript serverless REST framework. The goal is to exercise behavior as it would run after deployment: real HTTP requests, deployed routing, serialization, validation, database access, cold starts, runtime limits, and provider-specific edge cases.

Each test should be framed around a small real application, not framework internals. The test is useful only if it would fail when a shipped app built on the framework breaks.

## Test Harness Assumptions

- Deploy a minimal application using the framework to a real or production-equivalent serverless runtime.
- Run tests over HTTP against the deployed URL.
- Use a real database instance where persistence, transactions, migrations, or pooling matter.
- Treat generated OpenAPI/schema output, if available, as part of the public contract.
- Assert response bodies, status codes, headers, persistence side effects, logs where appropriate, and behavior across repeated invocations.

## Proposed Repository Structure

The deployed tests should live outside `packages/*` so they behave like a real consumer app. Package-level tests can still cover implementation details, but this suite should only import public package names such as `@tango-ts/orm`, `@tango-ts/router`, `@tango-ts/views`, `@tango-ts/serializers`, `@tango-ts/adapters`, and `@tango-ts/cli`.

```text
apps/
  rest-dogfood/
    README.md
    package.json
    migrations/
      0001_initial.ts
    src/
      app.ts
      db.ts
      handler.ts
      models.ts
      routes.ts
      serializers.ts
    test/
      deployed/
        auth-permissions.test.ts
        filtering-pagination.test.ts
        nested-crud.test.ts
        route-precedence.test.ts
        serializers.test.ts
        serverless-context.test.ts
        validation-errors.test.ts
      support/
        assertions.ts
        client.ts
        database.ts
        server.ts

vitest.deployed.config.ts
```

The dogfood app should be boring on purpose. It should look like code an application developer would write:

- Declare models with `model()` and fields from `@tango-ts/orm`.
- Declare serializers with `modelSerializer()`.
- Register resources with `createRouter()` and `modelViewSet()`.
- Wrap requests in `withConnection()` using a real MySQL connection.
- Serve the handler with `serve()` from `@tango-ts/adapters`.
- Run migrations through public CLI APIs such as `migrateApp()` or through the `tango` binary.

The test files should issue real `fetch()` calls against the app URL and assert only HTTP-visible behavior: status codes, JSON bodies, headers, database side effects, and repeat-request behavior.

## Integration With The Normal Test Suite

Add a third Vitest config for dogfood tests:

```text
vitest.deployed.config.ts
```

Recommended root scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:deployed": "vitest run --config vitest.deployed.config.ts",
    "test:all": "yarn typecheck && yarn lint && yarn test && yarn test:integration && yarn test:deployed"
  }
}
```

The local deployed suite should be part of `yarn test:all` once it is stable. It is slower than package tests, but it still runs locally against Docker MySQL and a local HTTP server, so it belongs in the normal confidence path.

Actual cloud deployment checks should reuse the same dogfood app and HTTP assertions, but run in a separate CI job or command because they need provider credentials and deployed URLs:

```text
yarn test:deployed              # local dogfood app through Node adapter
yarn test:deployed:cloud        # same contracts pointed at deployed URLs
```

Those cloud tests should fail loudly when required configuration is missing. They should not silently skip for missing URLs, database credentials, or provider tokens.

## Test Tiering

Use the same app code across tiers, but change only how the app is reached:

- **In-process package tests:** current `packages/*/test` suites. These can stay close to individual packages and may import local package entry points.
- **Local deployed-style tests:** `apps/rest-dogfood/test/deployed`. These start the public Node adapter on an ephemeral port and use HTTP `fetch()`.
- **Cloud deployed tests:** same assertions pointed at provider-deployed URLs. These verify adapter parity, deployment packaging, runtime limits, cold starts, environment config, and serverless behavior.

Every test in the dogfood suite should answer one question: could a developer build this application using only the public API, deploy or serve it, and get the behavior promised by the framework?

## Public API Rules For Dogfood Tests

- Do not import `packages/*/src/*`.
- Do not import package tests or test helpers from `packages/*/test`.
- Do not call unexported functions.
- Do not mock the database for behavior that depends on persistence.
- Do not bypass HTTP by calling a viewset method directly.
- Do not assert implementation details such as private class state or generated SQL unless that is explicitly the public contract of the tested feature.
- Prefer one shared app with multiple realistic resources over many tiny synthetic apps, unless a scenario needs conflicting route shapes or isolated configuration.

## First Implementable Slice

The current public surface can support an initial dogfood suite for:

- Basic resource create, list, and retrieve through `modelViewSet()`.
- Serializer output and read-only field protection.
- Validation errors and malformed JSON.
- Query filters and page/pageSize pagination.
- Auth and permission hooks.
- Route params, route precedence, `404`, and `405`.
- Request context isolation across repeated HTTP requests.
- Node adapter behavior through a real local server.
- MySQL setup and migration application through public APIs.

Scenarios requiring APIs that do not exist yet, such as `PATCH`, `DELETE`, multipart uploads, streaming responses, CORS helpers, OpenAPI generation, background work, and non-Node provider adapters, should remain in this document as future dogfood contracts. When those public APIs are designed, add the dogfood test first and then implement the feature.

## 1. Nested Resource CRUD With Ownership

Build a notes app:

- `POST /users/`
- `POST /users/{userId}/projects/`
- `POST /users/{userId}/projects/{projectId}/notes/`
- `GET /users/{userId}/projects/{projectId}/notes/{noteId}/`
- `PATCH /users/{userId}/projects/{projectId}/notes/{noteId}/`
- `DELETE /users/{userId}/projects/{projectId}/notes/{noteId}/`

Important cases:

- Creating a note under the correct parent persists the expected foreign keys.
- Looking up a note through the wrong user or project returns `404`, not leaked data.
- Deleting a parent project makes child note routes inaccessible.
- `PATCH` updates only provided fields and does not erase omitted fields.
- Repeating `DELETE` on the same note returns a consistent not-found or idempotent response based on the intended contract.
- Route parameters are correctly decoded when IDs contain URL-encoded characters, if string IDs are supported.

Why this matters:

Nested resource routing combines path matching, parameter extraction, authorization assumptions, persistence, and serialization. It catches many bugs that isolated handler tests miss.

## 2. Validation And Error Shape Contract

Build a user registration endpoint:

- `POST /registrations/`

Payload fields:

- `email`
- `password`
- `displayName`
- `age`
- `marketingOptIn`

Important cases:

- Missing required fields return `400` with field-level errors.
- Empty strings are rejected differently from missing fields where the app declares that distinction.
- Invalid email, too-short password, negative age, non-boolean `marketingOptIn`, and unknown fields produce deterministic validation errors.
- Multiple invalid fields return all expected errors, not only the first one, if the framework promises aggregated errors.
- Sensitive input such as `password` is never echoed back in errors.
- Malformed JSON returns a parse error with the framework's standard error envelope.
- `Content-Type: text/plain` with JSON-looking body is rejected or handled according to the documented contract.

Why this matters:

Validation is part of the REST framework's public API. Deployed tests should lock down the exact failure shape clients depend on.

## 3. Serializer Boundary And Secret Field Protection

Build account endpoints:

- `POST /accounts/`
- `GET /accounts/{id}/`
- `GET /accounts/me/`

Model fields:

- Public: `id`, `email`, `displayName`, `createdAt`
- Internal: `passwordHash`, `apiKeyHash`, `isStaff`, `deletedAt`

Important cases:

- Create responses never include internal fields.
- Detail responses never include internal fields.
- `PATCH` or `PUT` cannot set read-only fields like `id`, `createdAt`, `isStaff`, or `passwordHash`.
- Date fields serialize consistently across cold and warm invocations.
- `null`, omitted fields, default values, and computed fields serialize according to the declared schema.
- The framework does not accidentally serialize ORM/model instances with private properties.

Why this matters:

Serializer mistakes are high-impact: they leak secrets or allow clients to mutate protected data.

## 4. Query Parameter Filtering, Pagination, And Ordering

Build an orders endpoint:

- `GET /orders/`

Supported query parameters:

- `status`
- `customerId`
- `createdBefore`
- `createdAfter`
- `ordering`
- `limit`
- `cursor`

Important cases:

- Filters compose correctly when multiple query parameters are present.
- Repeated query parameters use the intended semantics, such as OR, AND, or rejection.
- Unknown query parameters are ignored or rejected according to contract.
- Pagination returns stable results when new rows are inserted between page requests.
- Invalid cursor values fail cleanly.
- Ordering by unsupported fields is rejected.
- `limit=0`, negative limits, huge limits, and non-numeric limits are handled safely.
- Date filters respect timezone and ISO parsing rules.

Why this matters:

List endpoints are where real clients most often hit framework-level ambiguity around parsing, typing, ordering, and pagination.

## 5. Middleware Ordering And Request Context Isolation

Build an app with middleware for:

- Request ID assignment
- Authentication
- JSON body parsing
- Tenant resolution
- Error handling
- Response timing headers

Important cases:

- Middleware runs in the documented order.
- Authentication can read parsed headers and set user context for downstream handlers.
- Tenant context is available to handlers and serializers.
- A thrown error still includes request ID and standard error headers.
- Concurrent requests for different tenants never share context.
- Warm invocations do not retain the previous request's user, tenant, body, or headers.

Why this matters:

Serverless runtimes reuse execution environments. Context leakage between requests is one of the most dangerous framework bugs.

## 6. Authentication And Authorization Across HTTP Methods

Build document endpoints:

- `GET /documents/`
- `GET /documents/{id}/`
- `POST /documents/`
- `PATCH /documents/{id}/`
- `DELETE /documents/{id}/`

Roles:

- Anonymous
- Reader
- Editor
- Owner
- Admin

Important cases:

- Anonymous users receive `401` where authentication is required.
- Authenticated but unauthorized users receive `403`.
- Users cannot infer existence of private documents if the intended behavior is `404` for unauthorized detail access.
- Method-specific permissions are enforced; a reader can view but not mutate.
- Bulk/list endpoints only include records visible to the current principal.
- Authorization is still enforced for nested actions and custom endpoints, not only basic CRUD routes.

Why this matters:

Authorization bugs often happen when routing, handlers, serializers, and list filtering are tested separately instead of as a deployed app.

## 7. Database Connection Reuse Under Serverless Concurrency

Build a write-heavy counter or inventory endpoint:

- `POST /inventory/{sku}/reserve/`
- `POST /inventory/{sku}/release/`
- `GET /inventory/{sku}/`

Important cases:

- A burst of concurrent requests does not exhaust database connections.
- Cold starts initialize the database connection exactly once per runtime instance where expected.
- Failed requests release or reuse connections correctly.
- Transaction failures do not poison the connection for later warm requests.
- Concurrent reservations cannot drive inventory below zero.
- Retries do not double-apply writes if an idempotency mechanism is provided.

Why this matters:

Serverless deployment changes database behavior. Local integration tests rarely catch connection storms, stale clients, or transaction edge cases.

## 8. Transaction Rollback And Partial Failure

Build checkout endpoints:

- `POST /checkout/`

Side effects:

- Create order
- Create order items
- Decrement inventory
- Record payment attempt
- Send webhook/event

Important cases:

- If item creation fails, no order remains.
- If inventory update fails, order and items are rolled back.
- If payment fails before commit, no committed order exists.
- If webhook/event dispatch fails after commit, the API returns the intended response and records retryable state.
- Error responses do not expose internal database details.
- Retrying the same checkout with an idempotency key returns the same result or safely resumes.

Why this matters:

Real REST apps cross persistence, external services, and framework error handling. This test separates transactional guarantees from post-commit side effects.

## 9. File Upload And Multipart Handling

Build profile avatar endpoints:

- `POST /profiles/{id}/avatar/`
- `GET /profiles/{id}/avatar/metadata/`

Important cases:

- Valid multipart upload succeeds with expected metadata.
- Missing file part returns a clear validation error.
- Multiple file parts are accepted or rejected according to contract.
- Oversized files fail before excessive memory use.
- Unsupported content types fail cleanly.
- Unicode filenames and filenames with path-like values cannot escape storage boundaries.
- Upload failure does not leave a database record pointing to a missing file.

Why this matters:

Multipart parsing can behave differently in serverless runtimes, especially around streams, memory limits, and body size limits.

## 10. Streaming Or Large Response Behavior

Build export endpoints:

- `GET /reports/{id}/export.csv`
- `GET /events/stream/`, if streaming is supported

Important cases:

- Large CSV export completes without loading the full response into memory, if streaming is part of the design.
- Correct `Content-Type`, `Content-Disposition`, and cache headers are present.
- Client disconnects do not leave long-running work stuck indefinitely.
- Runtime response size limits are handled intentionally.
- Streaming endpoints behave correctly across cold starts and provider adapters.

Why this matters:

Response streaming and large payloads often break only in deployed serverless environments.

## 11. Provider Adapter Parity

Deploy the same app to each supported adapter, such as:

- AWS Lambda/API Gateway
- Vercel
- Cloudflare Workers
- Node HTTP server

Use the same route set and run the same HTTP test suite.

Important cases:

- Path parameters, query strings, headers, cookies, and body parsing produce the same request object.
- Binary bodies are handled consistently.
- Multi-value headers and repeated query parameters follow the documented behavior.
- Error responses have the same envelope across adapters.
- Route matching is consistent for trailing slashes and encoded path segments.
- Runtime-specific limitations are documented by failing intentionally or skipping only at the suite-definition level with an explicit reason.

Why this matters:

A serverless framework's contract is only credible if adapter differences are surfaced and controlled.

## 12. CORS, Cookies, And Browser-Facing REST

Build session endpoints:

- `POST /sessions/`
- `GET /sessions/me/`
- `DELETE /sessions/current/`

Important cases:

- Preflight `OPTIONS` requests return the correct allowed methods and headers.
- Credentialed requests include the right CORS headers.
- Session cookies use `HttpOnly`, `Secure`, `SameSite`, path, and expiration attributes correctly.
- Cross-origin disallowed requests do not accidentally expose permissive CORS headers.
- Logout clears cookies in a way browsers actually honor.
- Auth failures do not set partial or stale cookies.

Why this matters:

REST frameworks often claim browser compatibility, but CORS and cookie details only become real at the deployed HTTP boundary.

## 13. OpenAPI Or Schema Generation Contract

Build a representative API using:

- Path parameters
- Query parameters
- Request bodies
- Response serializers
- Auth requirements
- Error responses

Important cases:

- Generated schema includes every deployed route.
- Path parameter names and types match the actual router.
- Required and optional request fields match deployed validation.
- Response schemas match actual serialized responses.
- Error envelopes are documented.
- Auth requirements are represented per route.
- A generated client can call the deployed API successfully for representative requests.

Why this matters:

Schema generation is not valuable unless it matches deployed behavior. This catches drift between declarations and runtime code.

## 14. Route Conflict And Precedence

Build routes with intentionally tricky overlap:

- `GET /users/me/`
- `GET /users/{id}/`
- `GET /files/{path}/`
- `GET /files/public/`
- `GET /reports/{year}/{month}/`
- `GET /reports/latest/`

Important cases:

- Static routes take precedence over dynamic routes where documented.
- Catch-all routes do not swallow more specific routes.
- Trailing slash behavior is consistent.
- URL-encoded slashes are handled intentionally.
- Unsupported methods on existing paths return `405` with allowed methods, if that is the contract.
- Unknown paths return the framework's standard `404`.

Why this matters:

Route precedence bugs are easy to miss and can silently expose wrong handlers in production.

## 15. Content Negotiation And Response Formatting

Build endpoints that can return:

- JSON
- Plain text
- CSV
- Problem/error JSON

Important cases:

- `Accept` headers are honored or ignored according to contract.
- Unsupported `Accept` values return the intended response.
- JSON responses always use the correct charset and body encoding.
- Empty responses, such as `204`, do not include accidental JSON bodies.
- HEAD requests return headers without a body where supported.
- Error responses keep the same envelope across content types where documented.

Why this matters:

Clients depend on exact HTTP semantics, not just handler return values.

## 16. Background Work And Post-Response Side Effects

Build notification endpoints:

- `POST /notifications/`

Side effects:

- Persist notification
- Queue email
- Queue push notification
- Write audit log

Important cases:

- The HTTP response is not delayed by background work beyond the intended boundary.
- Background failures are logged and retried if the framework provides a mechanism.
- Post-response work does not run twice on warm invocation reuse.
- A thrown handler error prevents post-response work if that is the intended contract.
- Request context needed by background work is copied safely, not read from mutable global request state.

Why this matters:

Serverless runtimes may freeze execution after response. Background behavior needs explicit deployed verification.

## 17. Observability And Error Reporting

Build endpoints that:

- Succeed
- Throw a known application error
- Throw an unexpected error
- Time out

Important cases:

- Every response includes or logs a request ID.
- Expected application errors are logged at the intended level.
- Unexpected errors include stack traces in logs but not in client responses.
- Validation failures are observable without being noisy.
- Timeout or cancellation paths are visible in logs or traces.
- Logs include route name, method, path, status, duration, and tenant/user identifiers where safe.

Why this matters:

Deployed tests should prove that production debugging will be possible when the framework is used by real apps.

## 18. Runtime Limits, Timeouts, And Cancellation

Build slow endpoints:

- `GET /slow/database/`
- `GET /slow/external-service/`
- `POST /slow/import/`

Important cases:

- Handler timeouts return the intended gateway/framework response.
- Aborted client requests cancel downstream work where supported.
- Slow database queries do not leave transactions open.
- External fetch timeouts are enforced and translated to framework errors.
- Runtime memory limits are not exceeded by large request bodies or responses.

Why this matters:

Framework abstractions should make runtime limits predictable instead of letting apps fail with provider-specific surprises.

## 19. Migration And Startup Behavior

Build a deployed app that needs database schema setup:

- `GET /health/`
- `POST /widgets/`
- `GET /widgets/{id}/`

Important cases:

- The app fails loudly if required migrations have not run.
- The health endpoint distinguishes process health from database readiness, if supported.
- Startup initialization is safe under concurrent cold starts.
- Two cold starts do not race to perform the same one-time setup unless explicitly supported.
- A partially failed initialization does not leave the runtime in a permanently broken warm state.

Why this matters:

Serverless startup behavior is subtle, especially when framework apps need registries, model discovery, migrations, or dependency initialization.

## 20. API Versioning And Backward Compatibility

Build versioned endpoints:

- `GET /v1/customers/{id}/`
- `GET /v2/customers/{id}/`
- `POST /v1/customers/`
- `POST /v2/customers/`

Important cases:

- Versioned routes can coexist without ambiguous matching.
- Different serializers per version return the expected fields.
- Deprecated fields remain available in `v1` but not `v2`.
- Validation changes do not leak between versions.
- Shared middleware still applies consistently.
- Generated schemas distinguish versions clearly.

Why this matters:

Frameworks need to support long-lived REST APIs where route declarations and serializers evolve over time.

## 21. Tenant Isolation At The Data Layer

Build a multi-tenant billing app:

- `GET /invoices/`
- `GET /invoices/{id}/`
- `POST /invoices/`

Important cases:

- Tenant is resolved from auth claims, subdomain, or header according to contract.
- List endpoints only return the current tenant's rows.
- Detail endpoints cannot access another tenant's invoice by ID.
- Create endpoints always stamp the current tenant, ignoring client-supplied tenant IDs.
- Background jobs and audit logs preserve tenant information.
- Concurrent requests from different tenants do not cross-contaminate request context or database filters.

Why this matters:

Tenant isolation is a production safety requirement and should be tested at the deployed boundary, not only in helper functions.

## 22. Idempotency For Unsafe Methods

Build payment endpoints:

- `POST /payments/`
- `POST /refunds/`

Important cases:

- Reusing the same idempotency key with the same payload returns the same result.
- Reusing the same idempotency key with a different payload is rejected.
- Concurrent requests with the same idempotency key only create one payment.
- Failed requests are cached or not cached according to the intended contract.
- Idempotency state is scoped correctly by tenant or authenticated user.

Why this matters:

Network retries are normal in deployed systems. REST frameworks should make duplicate writes testable and controllable where they provide idempotency support.

## 23. Webhook Receiver Robustness

Build webhook endpoints:

- `POST /webhooks/payment-provider/`

Important cases:

- Raw request body is available for signature verification before JSON parsing mutates it.
- Invalid signatures return `401` or `400` without processing the event.
- Replayed event IDs are ignored idempotently.
- Valid events update local records exactly once.
- Large but valid webhook bodies stay within configured limits.
- Provider retry behavior receives status codes that cause the desired retry or stop behavior.

Why this matters:

Webhook support stresses raw body access, parsing order, idempotency, error handling, and deployed HTTP behavior.

## 24. Health Checks And Readiness

Build health endpoints:

- `GET /health/live/`
- `GET /health/ready/`

Important cases:

- Liveness succeeds when the function can execute.
- Readiness fails when the database is unavailable.
- Readiness fails when required configuration is missing.
- Health responses do not expose secrets.
- Health endpoints are fast and bypass expensive middleware where intended.
- Auth is not accidentally required for public health endpoints, if they are meant for platform probes.

Why this matters:

Health checks are simple but operationally critical. They catch misconfiguration and dependency failures before users do.

## 25. Configuration And Secret Handling

Build endpoints that depend on config:

- `GET /config-dependent/`
- `POST /signed-actions/`

Important cases:

- Missing required environment variables fail at startup or first request according to the contract.
- Secrets are never returned in responses or logs.
- Config values are read consistently across warm invocations.
- Runtime config changes are handled according to documented behavior.
- Test, staging, and production deployments can use different config without code changes.

Why this matters:

Serverless deployments often fail because configuration is absent or stale. Framework-level behavior should be deliberate.

## 26. Rate Limiting And Abuse Protection

Build public endpoints:

- `POST /login/`
- `POST /password-reset/`
- `GET /public-search/`

Important cases:

- Rate limits are enforced by IP, user, tenant, or route according to configuration.
- Limits work across concurrent serverless instances, not just within one warm process.
- Error responses include the intended retry headers.
- Successful authentication does not accidentally bypass route-specific limits.
- Malformed requests still count or do not count according to policy.

Why this matters:

In-memory rate limiting can appear to work locally but fail completely when deployed across serverless instances.

## 27. Internationalization And Encoding

Build endpoints that accept and return user content:

- `POST /messages/`
- `GET /messages/{id}/`

Important cases:

- Unicode text persists and serializes correctly.
- Emoji, right-to-left text, combining characters, and non-Latin scripts survive round trips.
- Query filters work with URL-encoded Unicode.
- Validation counts characters or bytes according to documented behavior.
- Response headers declare encoding correctly.

Why this matters:

Encoding bugs often appear only when HTTP parsing, database encoding, and serialization are tested together.

## 28. Malicious Input And Parser Hardening

Build endpoints that parse JSON and query strings:

- `POST /search/`
- `POST /profiles/`

Important cases:

- Deeply nested JSON fails safely or is bounded.
- Extremely large arrays are rejected before exhausting memory.
- Prototype pollution payloads do not mutate global objects.
- Query strings with thousands of keys are bounded.
- Path traversal-looking strings are treated as data unless used in file paths, where they are rejected.
- Error responses remain deterministic under malformed input.

Why this matters:

Parser and object merging behavior is a common framework-level attack surface.

## 29. Custom Actions Beyond CRUD

Build task endpoints:

- `POST /tasks/{id}/complete/`
- `POST /tasks/{id}/assign/`
- `POST /tasks/{id}/reopen/`

Important cases:

- Custom action routes bind the same path params as standard detail routes.
- Actions enforce permissions independently.
- Invalid state transitions return domain errors, not generic framework failures.
- Actions appear in generated schema if the framework supports schema generation.
- Actions participate in middleware, transactions, and serializers consistently.

Why this matters:

Real REST apps need domain actions. Frameworks often handle basic CRUD well but get custom actions wrong.

## 30. Minimal App Smoke Test

Build the smallest possible deployed app:

- `GET /`
- `GET /health/`
- `POST /echo/`

Important cases:

- The app deploys without optional features installed.
- JSON body parsing works.
- Response helpers work.
- Unknown routes return a standard `404`.
- Unexpected errors return a standard `500`.
- Cold and warm requests produce the same results.

Why this matters:

This is the baseline canary. If it fails, the framework cannot be trusted in the target runtime.

## Review Questions

- Which of these are core framework guarantees versus examples that should live in downstream apps?
- Which serverless providers or adapters are in scope for the first deployed suite?
- Should deployed tests run on every PR, nightly, or before release only?
- What database should be considered the canonical production-equivalent target?
- What public contract should error envelopes, validation errors, and serializers guarantee?
- Does the framework want strict parity across adapters, or documented adapter-specific behavior?
- Which tests should be intentionally expensive because they catch the most dangerous production failures?
