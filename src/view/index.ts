import { Request } from 'express';

export type TangoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TangoResponse<T = any> = {
  status: number;
  body?: T;
};

export type TangoResolver = (args: { req: Request }) => Promise<TangoResponse>;
