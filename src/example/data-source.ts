import { DataSource } from 'typeorm';

import { Token } from '../authentication/token';
import { User } from '../authentication/user';
import { Blog } from './entity';

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  synchronize: true,
  logging: false, // ["query", "error"],
  entities: [Blog, User, Token],
  migrations: [],
  subscribers: [],
});
