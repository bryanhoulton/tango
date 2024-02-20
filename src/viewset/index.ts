import { Request } from 'express';
import {
  BaseEntity,
  FindOptionsWhere,
} from 'typeorm';

import { User } from '../authentication/user';
import { AppDataSource } from '../example/data-source';
import { Permission } from '../permissions';
import { Serializer } from '../serializer';
import {
  TangoResolver,
  TangoResponse,
} from '../view';

export interface ViewSet {
  list: TangoResolver;
  create: TangoResolver;
  retrieve: TangoResolver;
  update: TangoResolver;
  partialUpdate: TangoResolver;
  delete: TangoResolver;
}

export interface Dispatchable {
  dispatch(
    args: Parameters<TangoResolver>,
    method: keyof ViewSet
  ): Promise<TangoResponse>;
}

export interface DispatchableViewSet extends ViewSet, Dispatchable {}

export abstract class BaseViewSet<T extends typeof BaseEntity>
  implements DispatchableViewSet
{
  abstract entity: T;
  abstract serializer: typeof Serializer<T>;
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
  async hasPermission(req: Request, user: User | null): Promise<boolean> {
    const permissions = this.getPermissions(req);
    for (let permission of permissions) {
      const allowed = await permission.hasPermission(req, user);
      if (!allowed) {
        console.error(`Permission check failed for permission ${permission.constructor.name}: User not allowed.`);
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
  async dispatch(
    args: Parameters<TangoResolver>,
    fn: keyof ViewSet
  ): Promise<TangoResponse> {
    if (this[fn] === undefined) {
      return {
        status: 501,
      };
    }

    // Check permissions.
    const { req, user } = args[0];
    const isAllowed = await this.hasPermission(req, user);
    if (!isAllowed) {
      return {
        status: 403,
      };
    }

    return this[fn](...args);
  }

  // --------------------------------- Resolvers --------------------------------------
  list: TangoResolver = async ({}) => {
    const entities = await AppDataSource.manager.find<T>(this.entity);
    const serializer = new this.serializer();

    // Serialize the entities.
    const serializedEntities = await Promise.all(
      entities.map(async (entity) => {
        return await serializer.serialize(entity);
      })
    );

    return {
      status: 200,
      body: serializedEntities,
    };
  };

  create: TangoResolver = async ({ req }) => {
    // Deserialize the request body.
    const serializer = new this.serializer();
    const { value: instance, error } = await serializer.deserialize(req.body);
    if (error != undefined) {
      return {
        status: 400,
        body: error,
      };
    }

    // Save the instance.
    const result = await AppDataSource.manager.insert(this.entity, instance);
    return {
      status: 201,
      body: serializer.serialize(instance),
    };
  };

  retrieve: TangoResolver = async ({ req }) => {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }

    // TODO: If a model has no `id` field, this will break.
    const result = await AppDataSource.manager.findOne<T>(this.entity, {
      where: { id: id } as unknown as FindOptionsWhere<T>,
    });

    if (result === null) {
      return {
        status: 404,
      };
    }

    const serializer = new this.serializer();
    const serializedResult = await serializer.serialize(result);

    return {
      status: 200,
      body: serializedResult,
    };
  };

  update: TangoResolver = async (args) => {
    return this.partialUpdate(args);
  };

  partialUpdate: TangoResolver = async ({ req, ...rest }) => {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }

    // Deserialize the request body.
    const serializer = new this.serializer();
    const { value: instance, error } = await serializer.deserialize(req.body);
    if (error != undefined) {
      return {
        status: 400,
        body: error,
      };
    }

    // TODO: If a model has no `id` field, this will break.
    const result = await AppDataSource.manager.update(
      this.entity,
      { id: id },
      req.body
    );

    return this.retrieve({ req, ...rest });
  };

  delete: TangoResolver = async ({ req }) => {
    const id = req.params.id;
    if (id === undefined) {
      throw new Error("No id provided.");
    }

    const result = await AppDataSource.manager.delete<T>(this.entity, {
      id: id,
    });

    return {
      status: 204,
    };
  };
}
