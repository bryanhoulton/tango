import { TangoResponse } from '../view';
import {
  AfterArgs,
  Middleware,
} from './';

export class RequestLoggingMiddleware extends Middleware {
  async after({ req, status, body }: AfterArgs): Promise<TangoResponse> {
    this.server.logger.info(`${req.path} ${req.method} - ${status}`);
    return { status, body };
  }
}
