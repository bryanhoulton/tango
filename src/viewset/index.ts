import { Request } from "express";

import { Model } from "../model";

export class ModelViewSet {
  model: Model | null = null;

  dispatch(req: Request) {
    if (this.model === null) {
      throw new Error("ModelViewSet.model must be set before dispatching.");
    }

    if (req.method === "GET") {
      return this.list(req);
    }
  }

  list(req: Request): any {
    return ["hello", "world"];
  }

  create(req: Request): any {
    return {};
  }

  retrieve(req: Request): any {
    return {};
  }

  update(req: Request): any {
    return {};
  }

  partialUpdate(req: Request): any {
    return {};
  }

  delete(req: Request): any {
    return {};
  }
}
