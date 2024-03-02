import { Request } from 'express';

import { User } from '../entities/user';

export type TangoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TangoResponse<T = any> = {
  status: number;
  body?: T;
};

export type TangoResolver = (args: {
  req: Request;
  user: User | null;
}) => Promise<TangoResponse>;
