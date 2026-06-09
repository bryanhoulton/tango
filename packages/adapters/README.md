# @tango-ts/adapters

## Responsibility

Runtime adapters for Tango's Web-standard `Request` / `Response` handlers. This
package owns the Node server adapter and the Vercel adapter
(`@tango-ts/adapters/vercel`). It does not own routing, views, ORM behavior, or
migrations.

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
- `vercelHandler(handler)` (from `@tango-ts/adapters/vercel`) — wraps a project
  in Vercel's `fetch` web-handler export for the Node.js runtime. A subpath
  export so Vercel bundles never pull in `node:http`. Edge runtime is not
  supported (mysql2 needs TCP).

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
- Unit (`test/vercel.test.ts`): the Vercel fetch handler proxies requests and
  propagates rejections.
- Package (`test/exports.package.ts`): the `./vercel` subpath export resolves from
  the built artifact through package.json `exports`.
