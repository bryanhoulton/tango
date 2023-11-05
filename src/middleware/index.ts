import { Request } from "express";

import { TangoServer } from "../server";
import { TangoResponse } from "../view";

export class Middleware {
  server: TangoServer;

  constructor(server: TangoServer) {
    this.server = server;
  }

  async before(
    req: Request,
    status: number,
    body: any
  ): Promise<TangoResponse> {
    return { status, body };
  }

  async after(req: Request, status: number, body: any): Promise<TangoResponse> {
    return { status, body };
  }
}
