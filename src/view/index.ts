import { Request } from "express";

export type TangoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TangoResponse<T = any> = {
  status: number;
  body?: T;
};

export type TangoResolver = (req: Request) => Promise<TangoResponse>;
