/**
 * Flattens an intersection of object types into a single object type for
 * readable hovers and error messages. Purely cosmetic at the type level.
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {}

/**
 * Converts a union (`A | B | C`) into an intersection (`A & B & C`).
 * Used to merge per-field lookup object types into one filter object.
 */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never
