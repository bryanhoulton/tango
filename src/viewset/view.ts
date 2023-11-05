import { Request } from "express";

export type TangoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TangoResponse = {
  status: number;
  body?: any;
};
export type TangoResolver = (
  req: Request,
  pathVariables?: Record<string, string>
) => TangoResponse;
