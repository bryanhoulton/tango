import { Request } from 'express';
import { Authentication, TokenAuthentication } from './index';
import { Token } from '../entities/token';
import { User } from '../entities/user';
import { AppDataSource } from '../example/data-source';
import { TangoServer } from '../server';

describe('Authentication', () => {
  let authentication: Authentication;
  let server: TangoServer;

  beforeEach(() => {
    server = new TangoServer();
    authentication = new Authentication(server);
  });

  it('should return null when no auth header is provided', async () => {
    const req: Request = {
      headers: {},
    } as Request;

    const result = await authentication.authenticate(req);

    expect(result).toBeNull();
  });

  // Add more unit tests for different scenarios

});

describe('TokenAuthentication', () => {
  let tokenAuthentication: TokenAuthentication;
  let server: TangoServer;

  beforeEach(() => {
    server = new TangoServer();
    tokenAuthentication = new TokenAuthentication(server);
  });

  it('should return null when no auth header is provided', async () => {
    const req: Request = {
      headers: {},
    } as Request;

    const result = await tokenAuthentication.authenticate(req);

    expect(result).toBeNull();
  });

  // Add more unit tests for different scenarios

});
