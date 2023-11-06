export type ValueOrError<T, K = string> =
  | {
      value: T;
      error?: never;
    }
  | {
      value?: never;
      error: K;
    };
