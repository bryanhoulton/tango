import { Middleware } from '../middleware';

export type TangoServerGlobal = {
  minLogLevel?: number;
  middleware?: (typeof Middleware)[];
  adminPanelEnabled?: boolean;
};
