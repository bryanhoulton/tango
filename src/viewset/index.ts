import { Request } from "express";

import { Model } from "../model";
import { ModelManager } from "../model/manager";
import { ModelSerializer } from "../model/serializer";
import { TangoResponse } from "./view";

export interface ModelViewSetOptions<T extends Model> {
  modelManager: ModelManager<T>;
  serializer: ModelSerializer<T>;
}

export class ModelViewSet<T extends Model> {
  private modelManager: ModelManager<T>;
  private serializer: ModelSerializer<T>;

  constructor({ modelManager, serializer }: ModelViewSetOptions<T>) {
    this.modelManager = modelManager;
    this.serializer = serializer;
  }

  list(req: Request): TangoResponse {
    return {
      status: 200,
      body: ["hello", "world"],
    };
  }

  create(req: Request): TangoResponse {
    return {
      status: 501,
    };
  }

  retrieve(req: Request): TangoResponse {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }
    const result = this.modelManager?.findById(parseInt(id));

    if (result === null) {
      return {
        status: 404,
      };
    }

    const serialized = this.serializer.serialize(result);
    return {
      status: 200,
      body: serialized,
    };
  }

  update(req: Request): TangoResponse {
    return {
      status: 501,
    };
  }

  partialUpdate(req: Request): TangoResponse {
    return {
      status: 501,
    };
  }

  delete(req: Request): TangoResponse {
    return {
      status: 501,
    };
  }
}
