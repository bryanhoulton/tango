import { Request } from "express";
import { Permission } from "../permissions";
import { ViewSet } from "./index";

export function checkMethodExists(method: string, viewSet: ViewSet): boolean {
  return method in viewSet;
}

export function checkPermission(
  req: Request,
  user: User | null,
  permissions: Permission[]
): boolean {
  for (const permission of permissions) {
    const allowed = permission.hasPermission(req, user);
    if (!allowed) {
      console.error(
        `Permission check failed for permission ${permission.constructor.name}: User not allowed.`
      );
      return false;
    }
  }
  return true;
}
