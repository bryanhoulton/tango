import { DataSource } from 'typeorm';

import { Blog } from './entity';

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  synchronize: true,
  logging: false,
  entities: [Blog],
  migrations: [],
  subscribers: [],
});
