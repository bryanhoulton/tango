import express, { Request, Response } from "express";
import { ILogObj, Logger } from "tslog";
import { DataSource } from "typeorm";

import { User } from "../entities/user";
import { JSONObject } from "../response";
import { TangoRoute, TangoRouter } from "../router";
import { TangoResolver } from "../view";
import { TangoServerGlobal } from "./global";
import { TangoServerSingletons } from "./singletons";

export type TangoServerOptions = {
  datasource: DataSource;
  routes: TangoRoute;
  global: TangoServerGlobal;
};

/**
 * Represents the TangoServer class.
 * Used to create and configure the Tango server.
 */
export class TangoServer {
  global: TangoServerGlobal;
  router: TangoRouter;
  datasource: DataSource;
  private app: express.Express | undefined;
  logger: Logger<ILogObj>;
  singletons: TangoServerSingletons;

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
    this.singletons = {
      middleware: [],
      authentication: [],
    };
  }

/**
   * Start the Tango server and listen for incoming requests on the specified port.
   * @param port The port number to listen on.
   */
  async listen({ port }: { port: number }) {
    // ----- Express. -----
    this.app = express();
    this.app.use(express.json());
    this.logger.debug("Express app initialized.");

    // ----- Singletons. -----
    this.logger.debug("Initializing middleware...");
    for (let middleware of this.global.middleware || []) {
      this.singletons.middleware.push(new middleware(this));
    }
    this.logger.debug("All middleware initialized.");

    this.logger.debug("Initializing authentication...");
    for (let authentication of this.global.authentication || []) {
      this.singletons.authentication.push(new authentication(this));
    }
    this.logger.debug("All authentication initialized.");

    // ----- Bind routes. -----
    this.logger.debug("Binding routes...");
    this.bind({
      route: this.router.routes,
      rootPath: "/",
    });
    this.logger.debug("Routes bound.");

    // ----- Database. -----
    this.logger.debug("Initializing database connection...");
    await this.datasource.initialize();
    this.logger.debug("Database connection initialized.");

    this.app.listen(port, () => {
      this.logger.info(`Listening at http://localhost:${port}...`);
    });
  }

  /**
   * Recursively bind Tango routes to the Tango server's Express server.
   */
  bind({ route, rootPath = "/" }: { route: TangoRoute; rootPath: string }) {
    if (this.app === undefined) {
      throw new Error("Express app must be initialized before binding routes.");
    }

    for (const [path, subroute] of Object.entries(route)) {
      // If this is a resolver, bind it to the server. Else, recursively bind the subroute.
      if (typeof subroute === "function") {
        this.logger.trace(`Binding ${rootPath} - ${path}`);

        // Define the callback function for the route.
        const callback = this.generateResolverCallback(subroute);

        // Bind the route to the server.
        this.bindToExpress({
          path,
          rootPath,
          callback,
        });
      } else {
        this.bind({
          route: subroute,
          rootPath: rootPath + path,
        });
      }
    }
  }

  private bindToExpress({
    path,
    rootPath,
    callback,
  }: {
    path: string;
    rootPath: string;
    callback: (req: Request, res: Response) => Promise<void>;
  }) {
    if (this.app === undefined) {
      throw new Error("Express app must be initialized before binding routes.");
    }

    switch (path) {
      case "GET":
        this.app.get(rootPath, callback);
        break;
      case "POST":
        this.app.post(rootPath, callback);
        break;
      case "PUT":
        this.app.put(rootPath, callback);
        break;
      case "PATCH":
        this.app.patch(rootPath, callback);
        break;
      case "DELETE":
        this.app.delete(rootPath, callback);
        break;
      default:
        // Bind all methods to the route.
        this.app.get(rootPath + path, callback);
        this.app.post(rootPath + path, callback);
        this.app.put(rootPath + path, callback);
        this.app.patch(rootPath + path, callback);
        this.app.delete(rootPath + path, callback);
        break;
    }
  }

  /**
   * Generate a callback function for a route that can be passed to the Express app.
   * This callback function includes all authentication and middleware.
   * @param route
   * @returns
   */
  private generateResolverCallback(
    resolver: TangoResolver
  ): (req: Request, res: Response) => Promise<void> {
    return async (req: Request, res: Response) => {
      let status: number = 200;
      let body: JSONObject = {};
      let user: User | null = null;

      // Pass through any authentication.
      for (let authentication of this.singletons.authentication || []) {
        const foundUser = await authentication.authenticate(req);
        if (foundUser != null) {
          user = foundUser;
          this.logger.trace("User authenticated.");
          break;
        }
      }

      // Pass through any pre-request middleware.
      for (let middleware of this.singletons.middleware || []) {
        const result = await middleware.before({ req, status, body, user });
        status = result.status;
        body = result.body;
      }

      // Run through the viewset.
      const result = await resolver({
        req,
        user,
      });
      status = result.status;
      body = result.body;

      // Pass through any post-request middleware.
      for (let middleware of this.singletons.middleware || []) {
        const result = await middleware.after({ req, status, body, user });
        status = result.status;
        body = result.body;
      }

      // Send the response.
      res.status(status).send(body);
    };
  }
}
