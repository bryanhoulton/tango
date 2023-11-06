import { Request } from 'express';

import { User } from '../authentication/user';

export interface Permission {
  hasPermission(req: Request, user: User | null): Promise<boolean>;
}

export class AllowAny implements Permission {
  async hasPermission() {
    return true;
  }
}

export class AllowNone implements Permission {
  async hasPermission() {
    return false;
  }
}

export class IsAuthenticated implements Permission {
  async hasPermission(req: Request, user: User | null) {
    return user !== null;
  }
}
