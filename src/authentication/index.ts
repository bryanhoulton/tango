import { Request } from 'express';

import { AppDataSource } from '../example/data-source';
import { TangoServer } from '../server';
import { Token } from './token';
import { User } from './user';

export class Authentication {
  constructor(public server: TangoServer) {}

  async authenticate(req: Request): Promise<User | null> {
    return null;
  }
}

export class TokenAuthentication extends Authentication {
  async authenticate(req: Request): Promise<User | null> {
    this.server.logger.trace("Checking authentication with token...");

    // Read auth header.
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      this.server.logger.trace("No auth header.");
      return null;
    }

    // Parse auth header.
    const [type, value] = authHeader.split(" ");
    if (type !== "Bearer") {
      this.server.logger.trace("No auth header.");
      return null;
    }

    // Query for token.
    const token = await AppDataSource.getRepository(Token).findOne({
      where: {
        value: value,
      },
      relations: ["user"],
    });

    if (!token) {
      this.server.logger.trace("No token found.");
      return null;
    }

    return token.user;
  }
}
