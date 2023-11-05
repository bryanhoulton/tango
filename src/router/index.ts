import { Request, Response } from "express";

import { TangoServer } from "../server";
import { ModelViewSet } from "../viewset";
import { TangoResolver } from "../viewset/view";

export type TangoRoute = {
  [path: string]: TangoRoute | TangoResolver;
};

export class TangoRouter {
  routes: TangoRoute;

  constructor(routes: TangoRoute) {
    this.routes = routes;
  }

  static convertViewset(viewset: ModelViewSet): TangoRoute {
    return {
      "/": {
        GET: (req) => viewset.list(req),
        POST: (req) => viewset.create(req),
      },
      "/:id": {
        GET: (req) => viewset.retrieve(req),
        PUT: (req) => viewset.update(req),
        PATCH: (req) => viewset.partialUpdate(req),
        DELETE: (req) => viewset.delete(req),
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
        server.logger.info(`Binding ${rootPath} - ${path}`);

        // Define the callback function for the route.
        // TODO: Add middleware.
        const callback = (req: Request, res: Response) => {
          const result = route(req);
          res.send(result);
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
            throw new Error(`Unsupported method: ${path}`);
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
