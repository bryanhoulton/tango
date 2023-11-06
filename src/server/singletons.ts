import { Authentication } from '../authentication';
import { Middleware } from '../middleware';

export type TangoServerSingletons = {
  middleware: Middleware[];
  authentication: Authentication[];
};
