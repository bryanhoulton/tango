import { Request } from "express";
import { EntityTarget, ObjectLiteral } from "typeorm";

import { AppDataSource } from "../example/data-source";
import { Permission } from "../permissions";
import { TangoResponse } from "../view";

export interface ViewSet {
  list(req: Request): Promise<TangoResponse>;
  create(req: Request): Promise<TangoResponse>;
  retrieve(req: Request): Promise<TangoResponse>;
  update(req: Request): Promise<TangoResponse>;
  partialUpdate(req: Request): Promise<TangoResponse>;
  delete(req: Request): Promise<TangoResponse>;
}

export interface Dispatchable {
  dispatch(req: Request, method: keyof ViewSet): Promise<TangoResponse>;
}

export interface DispatchableViewSet extends ViewSet, Dispatchable {}

export abstract class BaseViewSet<T extends EntityTarget<ObjectLiteral>>
  implements DispatchableViewSet
{
  abstract entity: T;
  permissions: Permission[] = [];

  /**
   * Overridable function to get a list of permissions based on the request.
   * @param req
   * @returns
   */
  getPermissions(req: Request): Permission[] {
    return this.permissions;
  }

  /**
   * Iterates through all of the permissions (from getPermissions) and checks
   * if the request is allowed.
   * @param req
   * @returns true if the request is allowed, false otherwise.
   */
  async hasPermission(req: Request): Promise<boolean> {
    const permissions = this.getPermissions(req);
    for (let permission of permissions) {
      const allowed = await permission.hasPermission(req);
      if (!allowed) {
        return false;
      }
    }

    return true;
  }

  /**
   * Entrypoint for dispatching a request to the appropriate method.
   * Handles permissions and dis-allowed methods.
   * @param req
   * @param fn The method to dispatch to.
   * @returns
   */
  async dispatch(req: Request, fn: keyof ViewSet): Promise<TangoResponse> {
    if (this[fn] === undefined) {
      return {
        status: 501,
      };
    }

    // Check permissions.
    const isAllowed = await this.hasPermission(req);
    if (!isAllowed) {
      return {
        status: 403,
      };
    }

    return this[fn](req);
  }

  async list(req: Request): Promise<TangoResponse> {
    const blogs = await AppDataSource.manager.find(this.entity);
    return {
      status: 200,
      body: blogs,
    };
  }

  async create(req: Request): Promise<TangoResponse> {
    const result = await AppDataSource.manager.create(this.entity, req.body);
    return {
      status: 201,
      body: result,
    };
  }

  async retrieve(req: Request): Promise<TangoResponse> {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }

    const result = await AppDataSource.manager.findOne(this.entity, {
      where: { id: id },
    });

    if (result === null) {
      return {
        status: 404,
      };
    }

    return {
      status: 200,
      body: result,
    };
  }

  async update(req: Request): Promise<TangoResponse> {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }

    const result = await AppDataSource.manager.update(
      this.entity,
      { id: id },
      req.body
    );

    const newResult = await AppDataSource.manager.findOne(this.entity, {
      where: { id: id },
    });

    return {
      status: 201,
      body: newResult,
    };
  }

  async partialUpdate(req: Request): Promise<TangoResponse> {
    return this.update(req);
  }

  async delete(req: Request): Promise<TangoResponse> {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }

    const result = await AppDataSource.manager.delete(this.entity, {
      id: id,
    });

    return {
      status: 204,
    };
  }
}
