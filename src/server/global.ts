import { Authentication } from "../authentication";
import { Middleware } from "../middleware";

/**
 * Represents the global configuration for the Tango server.
 * Defines the minimum log level, authentication options, middleware, and admin panel settings.
 */
export type TangoServerGlobal = {
  minLogLevel?: number;
  authentication: (typeof Authentication)[];
  middleware?: (typeof Middleware)[];
  adminPanelEnabled?: boolean;
};
