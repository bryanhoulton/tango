import { RequestLoggingMiddleware } from '../middleware/logging';
import { TangoRouter } from '../router';
import { TangoServer } from '../server';
import { AppDataSource } from './data-source';
import {
  BlogViewset,
  healthCheck,
} from './viewsets';

const server = new TangoServer({
  datasource: AppDataSource,
  global: {
    minLogLevel: 3,
    middleware: [RequestLoggingMiddleware],
  },
  routes: {
    blog: TangoRouter.convertViewSet(new BlogViewset()),
    "health-check": {
      GET: healthCheck,
    },
  },
});

server.listen({
  port: 8000,
});
