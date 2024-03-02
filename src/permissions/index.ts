import { Request } from 'express';

export interface Permission {
  hasPermission(req: Request): Promise<boolean>;
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
