import { DataSource } from "typeorm";

import { Token } from "../entities/token";
import { User } from "../entities/user";
import { Blog } from "./entity";

/**
 * Data source file for holding data related configurations.
 * Contains the AppDataSource class for managing database connections.
 */
export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  synchronize: true,
  logging: false, // ["query", "error"],
  entities: [Blog, User, Token],
  migrations: [],
  subscribers: [],
});
