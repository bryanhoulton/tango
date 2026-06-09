import { DoesNotExist } from '@tango-ts/orm'

import { hashPassword, verifyPassword, type HashPasswordOptions } from './hashers.js'
import { User, type UserRow } from './models.js'

export interface CreateUserOptions {
  readonly email: string
  readonly password: string
  readonly firstName?: string
  readonly lastName?: string
  readonly isActive?: boolean
  readonly isStaff?: boolean
  readonly isSuperuser?: boolean
  /** Password hashing overrides (tests lower iterations for speed). */
  readonly hashing?: HashPasswordOptions
}

/** Create a user with a properly hashed password. */
export async function createUser(options: CreateUserOptions): Promise<UserRow> {
  return User.objects.create({
    email: options.email,
    password: await hashPassword(options.password, options.hashing),
    firstName: options.firstName ?? '',
    lastName: options.lastName ?? '',
    isActive: options.isActive ?? true,
    isStaff: options.isStaff ?? false,
    isSuperuser: options.isSuperuser ?? false,
    lastLogin: null
  })
}

/** Create a staff + superuser account (Django's `createsuperuser`). */
export async function createSuperuser(
  options: Omit<CreateUserOptions, 'isStaff' | 'isSuperuser' | 'isActive'>
): Promise<UserRow> {
  return createUser({ ...options, isStaff: true, isSuperuser: true })
}

/**
 * Check credentials and return the user, or `undefined` for any failure
 * (unknown email, wrong password, inactive account — indistinguishable to the
 * caller, like Django's `authenticate()`). When the email does not exist a
 * hash is still computed so response timing does not reveal which emails are
 * registered.
 */
export async function authenticateUser(
  email: string,
  password: string,
  options: { readonly hashing?: HashPasswordOptions } = {}
): Promise<UserRow | undefined> {
  let user: UserRow
  try {
    user = await User.objects.get({ email })
  } catch (err) {
    if (err instanceof DoesNotExist) {
      await hashPassword(password, options.hashing)
      return undefined
    }
    throw err
  }
  if (!(await verifyPassword(password, user.password))) {
    return undefined
  }
  return user.isActive ? user : undefined
}
