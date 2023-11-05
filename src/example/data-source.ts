import { DataSource } from "typeorm";

import { Blog } from "./entity";

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  synchronize: true,
  logging: false, // ["query", "error"],
  entities: [Blog],
  migrations: [],
  subscribers: [],
});
