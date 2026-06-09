# @tango-ts/adapters

## Responsibility

Runtime adapters for Tango's Web-standard `Request` / `Response` handlers. This
package currently owns the Node/local development adapter. It does not own routing,
views, ORM behavior, migrations, or platform-specific cloud adapters yet.

## What it responds to

- A Web handler: `(request: Request) => Response | Promise<Response>`.
- Node `IncomingMessage` / `ServerResponse` from the local HTTP server.

## Functionality

- `createNodeServer(handler, { logger, maxBodyBytes })` — creates a Node
  `http.Server` from a Web handler.
- `serve(handlerOrServer, { host, port, logger, maxBodyBytes })` — starts a server
  and returns `{ server, url, close() }`. `close()` drops idle keep-alive sockets
  and waits for in-flight requests.
- JSON 500 envelope for unexpected handler errors; the error itself is reported to
  the configured `Logger` (default: structured console logging) so failures are
  never silent.
- Request bodies are size-capped while streaming (default 10 MiB) and rejected
  with a JSON 413 envelope.

## Design patterns that matter here

- **Web core stays pure:** adapters translate platform IO into Web requests, then get
  out of the way.
- **Serverless-compatible shape:** the same handler can later be wrapped for Lambda,
  Vercel, or Cloudflare.
- **No `any`:** Node stream chunks are narrowed from `unknown` before conversion.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit/integration (`test/node.test.ts`): starts an ephemeral local server, sends real
  HTTP requests with `fetch`, verifies request forwarding and error envelopes, then
  closes the server.
