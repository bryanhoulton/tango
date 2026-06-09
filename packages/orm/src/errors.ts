/** Raised by `get()` when no row matches (mirrors Django's `Model.DoesNotExist`). */
export class DoesNotExist extends Error {
  constructor(model: string) {
    super(`${model} matching query does not exist.`)
    this.name = 'DoesNotExist'
  }
}

/** Raised by `get()` when more than one row matches. */
export class MultipleObjectsReturned extends Error {
  constructor(model: string, count: number) {
    super(`get() returned more than one ${model} -- it returned ${count}.`)
    this.name = 'MultipleObjectsReturned'
  }
}
