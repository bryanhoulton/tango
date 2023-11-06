import { Request } from 'express';

import { User } from '../authentication/user';
import { TangoServer } from '../server';
import { TangoResponse } from '../view';

export type BeforeArgs = {
  req: Request;
  user: User | null;
  status: number;
  body: any;
};
export type AfterArgs = BeforeArgs;

export class Middleware {
  server: TangoServer;

  constructor(server: TangoServer) {
    this.server = server;
  }

  async before({ status, body }: BeforeArgs): Promise<TangoResponse> {
    return { status, body };
  }

  async after({ status, body }: AfterArgs): Promise<TangoResponse> {
    return { status, body };
  }
}

export * from "./logging";
