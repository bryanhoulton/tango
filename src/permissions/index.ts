export abstract class Permission {
  abstract hasPermission(req: Request): boolean;
}

export class AllowAny extends Permission {
  hasPermission(req: Request) {
    return true;
  }
}
