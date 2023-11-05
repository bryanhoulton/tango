import { Request } from "express";

import { TangoResponse } from "../view";
import { Middleware } from "./";

export class RequestLoggingMiddleware extends Middleware {
  async after(req: Request, status: number, body: any): Promise<TangoResponse> {
    this.server.logger.info(`${req.path} ${req.method} - ${status}`);
    return { status, body };
  }
}
