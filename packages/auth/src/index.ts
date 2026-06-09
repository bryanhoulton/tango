import type { RequestContext } from '@tango-ts/http'

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

export interface Authentication {
  authenticate(ctx: RequestContext): MaybePromise<AuthenticatedUser | undefined>
}

export interface Permission {
  readonly requiresAuthentication?: boolean
  hasPermission(ctx: RequestContext): MaybePromise<boolean>
}

export type TokenVerifier = (
  token: string,
  ctx: RequestContext
) => MaybePromise<AuthenticatedUser | undefined>

export interface TokenAuthenticationOptions {
  readonly verifyToken: TokenVerifier
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

abstract class HeaderTokenAuthentication implements Authentication {
  protected constructor(
    private readonly scheme: string,
    private readonly verifier: TokenVerifier
  ) {}

  async authenticate(
    ctx: RequestContext
  ): Promise<AuthenticatedUser | undefined> {
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

export class BearerTokenAuthentication extends HeaderTokenAuthentication {
  constructor(options: TokenAuthenticationOptions) {
    super('Bearer', options.verifyToken)
  }
}

export class TokenAuthentication extends HeaderTokenAuthentication {
  constructor(options: TokenAuthenticationOptions) {
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
