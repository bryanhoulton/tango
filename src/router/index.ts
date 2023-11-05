import { Request, Response } from "express";

import { JSONObject } from "../response/json";
import { TangoServer } from "../server";
import { TangoResolver } from "../view";
import { DispatchableViewSet } from "../viewset";

export type TangoRoute = {
  [path: string]: TangoRoute | TangoResolver;
};

export class TangoRouter {
  routes: TangoRoute;

  constructor(routes: TangoRoute) {
    this.routes = routes;
  }

  static convertViewSet(viewset: DispatchableViewSet): TangoRoute {
    return {
      "/": {
        GET: (req) => viewset.dispatch(req, "list"),
        POST: (req) => viewset.dispatch(req, "create"),
      },
      "/:id": {
        GET: (req) => viewset.dispatch(req, "retrieve"),
        PUT: (req) => viewset.dispatch(req, "update"),
        PATCH: (req) => viewset.dispatch(req, "partialUpdate"),
        DELETE: (req) => viewset.dispatch(req, "delete"),
      },
    };
  }

  /**
   * Recursively bind routes to the Tango server.
   */
  bind({
    server,
    rootPath = "/",
    routes = this.routes,
  }: {
    server: TangoServer;
    rootPath: string;
    routes?: TangoRoute;
  }) {
    if (server.app === undefined) {
      throw new Error("Express app must be initialized before binding routes.");
    }

    for (const [path, route] of Object.entries(routes)) {
      if (typeof route === "function") {
        server.logger.trace(`Binding ${rootPath} - ${path}`);

        // Define the callback function for the route.
        const callback = async (req: Request, res: Response) => {
          let status: number = 200;
          let body: JSONObject = {};

          // Pass through any pre-request middleware.
          for (let middleware of server.singletonMiddlewares || []) {
            const result = await middleware.before(req, status, body);
            status = result.status;
            body = result.body;
          }

          // Run through the viewset.
          const result = await route(req);
          status = result.status;
          body = result.body;

          // Pass through any post-request middleware.
          for (let middleware of server.singletonMiddlewares || []) {
            const result = await middleware.after(req, status, body);
            status = result.status;
            body = result.body;
          }

          // Send the response.
          res.status(status).send(body);
        };

        // Bind the route to the server.
        switch (path) {
          case "GET":
            server.app.get(rootPath, callback);
            break;
          case "POST":
            server.app.post(rootPath, callback);
            break;
          case "PUT":
            server.app.put(rootPath, callback);
            break;
          case "PATCH":
            server.app.patch(rootPath, callback);
            break;
          case "DELETE":
            server.app.delete(rootPath, callback);
            break;
          default:
            // Bind all methods to the route.
            server.app.get(rootPath + path, callback);
            server.app.post(rootPath + path, callback);
            server.app.put(rootPath + path, callback);
            server.app.patch(rootPath + path, callback);
            server.app.delete(rootPath + path, callback);
            break;
        }
      } else {
        // Recursively bind the route.
        this.bind({
          server,
          rootPath: rootPath + path,
          routes: route as TangoRoute,
        });
      }
    }
  }
}
