# @tango-ts/auth

## Responsibility

Stateless DRF-style authentication and permission primitives. This package parses
authorization headers, verifies tokens through user-supplied functions, and provides
permission classes for the view layer. It does not own sessions, user persistence, or
database lookups; those stay explicit and pluggable.

## What it responds to

- A Web `RequestContext`.
- `Authorization` headers.
- Token verifier callbacks supplied by the application.

## Functionality

- `BearerTokenAuthentication`.
- `TokenAuthentication` (`Authorization: Token ...`, DRF-style).
- `AuthenticationFailed`.
- `AllowAny`.
- `IsAuthenticated`.
- `IsAdminUser`.
- `Permission.hasObjectPermission?(ctx, obj)` — optional object-level check
  (DRF's `has_object_permission`), called by viewsets for detail actions after
  the row is fetched; denial is a 403.

## Design patterns that matter here

- **Serverless:** no sessions or in-memory state.
- **Explicit verification:** token verification is injected; this package does not know
  where users live.
- **DRF envelopes:** invalid/missing auth maps to 401 in the view layer; permission
  denial maps to 403.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/auth.test.ts`): token parsing, invalid tokens, and permission classes.
- Integration coverage through `@tango-ts/views` auth tests.
