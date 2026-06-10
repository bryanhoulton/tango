import { detailResponse, type RequestContext } from '@tango-ts/http'

export type MaybePromise<T> = T | Promise<T>

export interface AuthenticatedUser {
  readonly id?: string | number
  readonly isStaff?: boolean
  readonly isSuperuser?: boolean
  readonly [key: string]: unknown
}

export class AuthenticationFailed extends Error {
  constructor(message = 'Invalid token.') {
    super(message)
    this.name = 'AuthenticationFailed'
  }
}

/**
 * An authentication class. `User` is the type it resolves credentials to —
 * it flows through `apiView` and viewsets onto `ctx.user`, so handlers see a
 * typed user instead of `unknown`.
 */
export interface Authentication<User = AuthenticatedUser> {
  authenticate(ctx: RequestContext): MaybePromise<User | undefined>
}

export interface Permission<User = unknown> {
  readonly requiresAuthentication?: boolean
  hasPermission(ctx: RequestContext<User>): MaybePromise<boolean>
  /**
   * Object-level check (DRF's `has_object_permission`). Called by viewsets for
   * detail actions after the row is fetched; denial is a 403. Optional — most
   * permissions only gate the request itself.
   */
  hasObjectPermission?(
    ctx: RequestContext<User>,
    obj: unknown
  ): MaybePromise<boolean>
}

export type TokenVerifier<User = AuthenticatedUser> = (
  token: string,
  ctx: RequestContext
) => MaybePromise<User | undefined>

export interface TokenAuthenticationOptions<User = AuthenticatedUser> {
  readonly verifyToken: TokenVerifier<User>
}

function authorization(ctx: RequestContext): string | undefined {
  return ctx.request.headers.get('authorization') ?? undefined
}

function userRecord(ctx: RequestContext): AuthenticatedUser | undefined {
  const user = ctx.user
  return user !== null && typeof user === 'object'
    ? (user as AuthenticatedUser)
    : undefined
}

abstract class HeaderTokenAuthentication<User> implements Authentication<User> {
  protected constructor(
    private readonly scheme: string,
    private readonly verifier: TokenVerifier<User>
  ) {}

  async authenticate(ctx: RequestContext): Promise<User | undefined> {
    const header = authorization(ctx)
    if (header === undefined) {
      return undefined
    }
    const [scheme, token, extra] = header.split(/\s+/)
    if (scheme !== this.scheme) {
      return undefined
    }
    if (token === undefined || token.length === 0 || extra !== undefined) {
      throw new AuthenticationFailed()
    }
    const user = await this.verifier(token, ctx)
    if (user === undefined) {
      throw new AuthenticationFailed()
    }
    return user
  }
}

export class BearerTokenAuthentication<
  User = AuthenticatedUser
> extends HeaderTokenAuthentication<User> {
  constructor(options: TokenAuthenticationOptions<User>) {
    super('Bearer', options.verifyToken)
  }
}

export class TokenAuthentication<
  User = AuthenticatedUser
> extends HeaderTokenAuthentication<User> {
  constructor(options: TokenAuthenticationOptions<User>) {
    super('Token', options.verifyToken)
  }
}

export const AllowAny: Permission = {
  hasPermission: () => true
}

export const IsAuthenticated: Permission = {
  requiresAuthentication: true,
  hasPermission: (ctx) => ctx.user !== undefined
}

export const IsAdminUser: Permission = {
  requiresAuthentication: true,
  hasPermission: (ctx) => {
    const user = userRecord(ctx)
    return user?.isStaff === true || user?.isSuperuser === true
  }
}

/** A permission class or a bare predicate (treated as not requiring auth). */
export type PermissionCheck<User = unknown> =
  | Permission<User>
  | ((ctx: RequestContext<User>) => MaybePromise<boolean>)

export interface AuthPipelineOptions<User = AuthenticatedUser> {
  readonly authentication?: readonly Authentication<User>[]
  // NoInfer: only `authentication` decides the user type — a `Permission`
  // written against a wider user must not widen `ctx.user` for handlers.
  readonly permissions?: readonly PermissionCheck<NoInfer<User>>[]
}

/**
 * Run authentication classes in order; the first one that identifies a user
 * wins. Classes that don't match the request (e.g. no `Authorization` header
 * for their scheme) return `undefined` and the next is tried. Invalid
 * credentials raise `AuthenticationFailed` (mapped to a 401 by callers).
 */
export async function runAuthentication<User>(
  ctx: RequestContext,
  authentication: readonly Authentication<User>[]
): Promise<User | undefined> {
  for (const authenticator of authentication) {
    const user = await authenticator.authenticate(ctx)
    if (user !== undefined) {
      return user
    }
  }
  return undefined
}

/**
 * Evaluate permissions against an (already authenticated) context. Returns
 * the DRF-style denial response — 401 for missing credentials, 403 for denial
 * — or `undefined` when every permission allows the request.
 */
export async function checkPermissions<User>(
  ctx: RequestContext<User>,
  permissions: readonly PermissionCheck<User>[]
): Promise<Response | undefined> {
  for (const permission of permissions) {
    const requiresAuthentication =
      typeof permission === 'function'
        ? false
        : permission.requiresAuthentication === true
    if (requiresAuthentication && ctx.user === undefined) {
      return detailResponse('Authentication credentials were not provided.', 401)
    }
    const allowed =
      typeof permission === 'function'
        ? await permission(ctx)
        : await permission.hasPermission(ctx)
    if (!allowed) {
      return detailResponse('Permission denied.', 403)
    }
  }
  return undefined
}

/**
 * Run the object-level pass (DRF's `has_object_permission`) for permission
 * classes that implement it. Returns the 403 response on denial.
 */
export async function checkObjectPermissions<User>(
  ctx: RequestContext<User>,
  permissions: readonly PermissionCheck<User>[],
  obj: unknown
): Promise<Response | undefined> {
  for (const permission of permissions) {
    if (typeof permission === 'function') {
      continue
    }
    if (
      permission.hasObjectPermission !== undefined &&
      !(await permission.hasObjectPermission(ctx, obj))
    ) {
      return detailResponse('Permission denied.', 403)
    }
  }
  return undefined
}

export type ApiViewHandler = (
  ctx: RequestContext
) => MaybePromise<Response>

/**
 * DRF's `@api_view` for plain routes: wraps a handler so it runs the same
 * authentication + permission pipeline as `ModelViewSet`. The handler receives
 * a context whose `user` is set by the authentication classes (falling back to
 * any user already on the context, e.g. from project-level authentication).
 *
 * `ctx.user` in the handler is typed as whatever the `authentication` classes
 * resolve to (e.g. `Authentication<PublicUser>` yields `ctx.user?: PublicUser`).
 * Without authentication classes it defaults to `AuthenticatedUser`.
 *
 * ```ts
 * route('GET', '/me/', apiView(
 *   { authentication: [auth], permissions: [IsAuthenticated] },
 *   (ctx) => jsonResponse(ctx.user)
 * ))
 * ```
 */
export function apiView<User = AuthenticatedUser>(
  options: AuthPipelineOptions<User>,
  handler: (ctx: RequestContext<User>) => MaybePromise<Response>
): ApiViewHandler {
  return async (ctx) => {
    let user = ctx.user as User | undefined
    try {
      user = (await runAuthentication(ctx, options.authentication ?? [])) ?? user
    } catch (err) {
      if (err instanceof AuthenticationFailed) {
        return detailResponse(err.message, 401)
      }
      throw err
    }
    const authedCtx: RequestContext<User> = { ...ctx, user }
    const denied = await checkPermissions(authedCtx, options.permissions ?? [])
    if (denied !== undefined) {
      return denied
    }
    return handler(authedCtx)
  }
}
