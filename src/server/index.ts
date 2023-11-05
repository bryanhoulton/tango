import express from "express";
import { ILogObj, Logger } from "tslog";

import { TangoRoute, TangoRouter } from "../router";
import { TangoServerGlobal } from "./global";

export type TangoServerOptions = {
  routes: TangoRoute;
  global: TangoServerGlobal;
};

export class TangoServer {
  global: TangoServerGlobal;
  router: TangoRouter;
  app: express.Express | undefined;
  logger: Logger<ILogObj>;

  constructor({ global, routes }: TangoServerOptions) {
    this.global = global || {
      authentication: [],
      permissions: [],
    };
    this.router = new TangoRouter(routes);
    this.logger = new Logger({
      name: "TangoServer",
      hideLogPositionForProduction: true,
    });
  }

  listen({ port }: { port: number }) {
    this.app = express();

    this.router.bind({
      server: this,
      rootPath: "/",
    });

    this.app.listen(port, () => {
      console.log(`server started at http://localhost:${port}`);
    });
  }
}
