import { Request } from "express";

export type TangoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type TangoResolver = (req: Request) => any;
