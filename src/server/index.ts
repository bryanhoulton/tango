import express from "express";
import { ILogObj, Logger } from "tslog";
import { DataSource } from "typeorm";

import { Middleware } from "../middleware";
import { TangoRoute, TangoRouter } from "../router";
import { TangoServerGlobal } from "./global";

export type TangoServerOptions = {
  datasource: DataSource;
  routes: TangoRoute;
  global: TangoServerGlobal;
};

export class TangoServer {
  global: TangoServerGlobal;
  router: TangoRouter;
  datasource: DataSource;
  app: express.Express | undefined;
  logger: Logger<ILogObj>;
  singletonMiddlewares: Middleware[] = [];

  constructor({ global, routes, datasource }: TangoServerOptions) {
    this.global = global || {
      authentication: [],
      permissions: [],
    };
    this.router = new TangoRouter(routes);
    this.datasource = datasource;
    this.logger = new Logger({
      name: "TangoServer",
      hideLogPositionForProduction: true,
      minLevel: global.minLogLevel,
    });
  }

  async listen({ port }: { port: number }) {
    this.app = express();
    this.app.use(express.json());
    this.logger.debug("Express app initialized.");

    this.logger.debug("Initializing middleware...");
    for (let middleware of this.global.middleware || []) {
      this.singletonMiddlewares.push(new middleware(this));
    }
    this.logger.debug("All middleware initialized.");

    this.logger.debug("Binding routes...");
    this.router.bind({
      server: this,
      rootPath: "/",
    });
    this.logger.debug("Routes bound.");

    this.logger.debug("Initializing database connection...");
    await this.datasource.initialize();
    this.logger.debug("Database connection initialized.");

    this.app.listen(port, () => {
      this.logger.info(`Listening at http://localhost:${port}...`);
    });
  }
}
