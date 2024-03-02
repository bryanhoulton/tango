import { Request } from 'express';

import { User } from '../entities/user';

export type TangoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Represents the view module of the Tango server.
 * Includes configuration for serving views and handling requests.
 */
export type TangoResponse<T = any> = {

/**
 * Represents the response type of the Tango server.
 * Contains the status code and response body.
 */
  status: number;
  body?: T;
};

export type TangoResolver = (args: {

/**
 * Represents a resolver function for handling requests.
 * Provides access to the request and user information.
 */
  req: Request;
  user: User | null;
}) => Promise<TangoResponse>;
