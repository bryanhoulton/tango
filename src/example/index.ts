import { TokenAuthentication } from "../authentication";
import { RequestLoggingMiddleware } from "../middleware/logging";
import { TangoRouter } from "../router";
import { TangoServer } from "../server";
import { AppDataSource } from "./data-source";
import { BlogViewset } from "./viewsets";

const server = new TangoServer({
  datasource: AppDataSource,
  global: {
    minLogLevel: 3,
    authentication: [TokenAuthentication],
    middleware: [RequestLoggingMiddleware],
  },
  routes: {
    blog: TangoRouter.convertViewSet(new BlogViewset()),
  },
});

server.listen({
  port: 8000,
});
