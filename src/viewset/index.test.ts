import { Request } from 'express';
import { BaseEntity, FindOptionsWhere } from 'typeorm';
import { User } from '../authentication/user';
import { AppDataSource } from '../example/data-source';
import { Permission } from '../permissions';
import { Serializer } from '../serializer';
import { TangoResolver, TangoResponse } from '../view';
import { ViewSet, Dispatchable, DispatchableViewSet, BaseViewSet } from './index';
import { Logger } from '../utils/logger';
import { BaseEntity, FindOptionsWhere } from 'typeorm';
import { User } from '../authentication/user';
import { AppDataSource } from '../example/data-source';
import { Permission } from '../permissions';
import { Serializer } from '../serializer';
import { TangoResolver, TangoResponse } from '../view';
import { ViewSet, Dispatchable, DispatchableViewSet, BaseViewSet } from './index';

describe('BaseViewSet', () => {
  let baseViewSet: BaseViewSet<any>;

  beforeEach(() => {
    baseViewSet = new BaseViewSet();
  });

  describe('getPermissions', () => {
    it('should return an array of permissions', () => {
      // TODO: Implement test case
    });

    it('should return an empty array if no permissions are set', () => {
      // TODO: Implement test case
    });
  });

  describe('hasPermission', () => {
    it('should return true when all permissions allow the request', async () => {
      // TODO: Implement test case
    });

    it('should return false when at least one permission denies the request', async () => {
      // TODO: Implement test case
    });
  });

  describe('dispatch', () => {
    it('should return a 501 status code when the method is not implemented', async () => {
      // TODO: Implement test case
    });

    it('should return a 403 status code when the request is not allowed', async () => {
      // TODO: Implement test case
    });

    it('should call the corresponding method and return its result when the request is allowed', async () => {
      // TODO: Implement test case
    });
  });

  describe('list', () => {
    it('should return a 200 status code and the serialized entities', async () => {
      // TODO: Implement test case
    });
  });

  describe('create', () => {
    it('should return a 201 status code and the serialized instance', async () => {
      // TODO: Implement test case
    });

    it('should return a 400 status code and an error message when the request body is invalid', async () => {
      // TODO: Implement test case
    });
  });

  describe('retrieve', () => {
    it('should return a 200 status code and the serialized result', async () => {
      // TODO: Implement test case
    });

    it('should return a 404 status code when the result is null', async () => {
      // TODO: Implement test case
    });

    it('should throw an error when no id is provided', async () => {
      // TODO: Implement test case
    });
  });

  describe('update', () => {
    it('should call the partialUpdate function and return its result', async () => {
      // TODO: Implement test case
    });
  });

  describe('partialUpdate', () => {
    it('should return the result of the retrieve function', async () => {
      // TODO: Implement test case
    });

    it('should return a 400 status code and an error message when the request body is invalid', async () => {
      // TODO: Implement test case
    });

    it('should throw an error when no id is provided', async () => {
      // TODO: Implement test case
    });
  });

  describe('delete', () => {
    it('should return a 204 status code', async () => {
      // TODO: Implement test case
    });
  });
});
