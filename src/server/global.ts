import { Authentication } from "../authentication";
import { Middleware } from "../middleware";

export type TangoServerGlobal = {
  minLogLevel?: number;
  authentication: Authentication[];
  middleware?: (typeof Middleware)[];
};
