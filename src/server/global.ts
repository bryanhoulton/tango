import { Authentication } from "../authentication";
import { Permission } from "../permissions";

export type TangoServerGlobal = {
  authentication: Authentication[];
  permissions: Permission[];
};
