import { TangoResolver } from '../view';
import { DispatchableViewSet } from '../viewset';

export type TangoRoute = {
  [path: string]: TangoRoute | TangoResolver;
};

export class TangoRouter {
  constructor(public routes: TangoRoute) {}

  static convertViewSet(viewset: DispatchableViewSet): TangoRoute {
    return {
      "/": {
        GET: (args) => viewset.dispatch([args], "list"),
        POST: (req) => viewset.dispatch([req], "create"),
      },
      "/:id": {
        GET: (req) => viewset.dispatch([req], "retrieve"),
        PUT: (req) => viewset.dispatch([req], "update"),
        PATCH: (req) => viewset.dispatch([req], "partialUpdate"),
        DELETE: (req) => viewset.dispatch([req], "delete"),
      },
    };
  }
}
